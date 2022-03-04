const fs = require('fs');
const readline = require('readline');
const os = require('os');
const AWS = require('aws-sdk');

class ServerlessAWS2ndFactor {
  constructor(serverless) {
    this.serverless = serverless;
    const service = this.serverless.service || {};
    const baseCustom = service.custom || {};
    const custom = baseCustom['aws-2nd-factor'] || {};
    const envIsLocal = process.env.SERVERLESS_LOCAL_ENV || process.env.CF_IS_LOCAL || false;
    this.LOCAL_PROFILE = custom.localProfile || 'cf-dev';
    this.BASE_PROFILE = custom.baseProfile || 'cf';
    this.MAX_TIME = custom.maxTime || 3600 * 12;
    this.TMP_FILE = custom.tmpFile || os.tmpdir() + '/.2nd-aws-credentials.tmp';
    this.SESSION_PREFIX = custom.sessionPrefix || 'cfsvl-';
    this.AWS_MFA_SERIAL_NUMBER = process.env.AWS_MFA_SERIAL_NUMBER || custom.mfaSerialNumber || null;
    this.CF_IS_LOCAL = !!((custom.force === true) || envIsLocal);
  }

  async asyncInit() {
    await this.mfa();
  }

  saveCredentials(credentials) {
    const expires = new Date().getTime() + this.MAX_TIME * 1000;
    credentials.expires = expires;
    fs.writeFileSync(
        this.TMP_FILE,
        JSON.stringify({
          expires,
          Credentials: {
            AccessKeyId: credentials.Credentials.AccessKeyId,
            SessionToken: credentials.Credentials.SessionToken,
            SecretAccessKey: credentials.Credentials.SecretAccessKey,
          },
        }),
        'utf-8'
    );
  }

  async getOtp() {
    return new Promise((resolve) => {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });
      rl.question('Insert MFA code: ', (answer) => {
        rl.close();
        resolve(answer.trim());
      });
    });
  }

  async obtainCredentials() {
    const { roleArn } = new AWS.SharedIniFileCredentials({ profile: this.LOCAL_PROFILE });
    AWS.config.credentials = new AWS.SharedIniFileCredentials({ profile: this.BASE_PROFILE });
    let stsCredentials = false;
    try {
      stsCredentials = JSON.parse(fs.readFileSync(this.TMP_FILE, 'utf-8'));
      const time = new Date().getTime();
      if (stsCredentials.expires < time) {
        fs.unlinkSync(this.TMP_FILE);
        throw new Error('Expired credentials');
      }
    } catch (e) {
      const sts = new AWS.STS();
      const otp = await this.getOtp();
      stsCredentials = await sts
          .getSessionToken({
            DurationSeconds: this.MAX_TIME,
            SerialNumber: this.AWS_MFA_SERIAL_NUMBER,
            TokenCode: otp,
          })
          .promise();
      this.saveCredentials(stsCredentials);
    }
    return { roleArn, stsCredentials };
  }

  async getCredentials() {
    const { roleArn, stsCredentials } = await this.obtainCredentials();
    try {
      const sts = new AWS.STS();
      AWS.config.credentials.accessKeyId = stsCredentials.Credentials.AccessKeyId;
      AWS.config.credentials.sessionToken = stsCredentials.Credentials.SessionToken;
      AWS.config.credentials.secretAccessKey = stsCredentials.Credentials.SecretAccessKey;
      const { Credentials } = await sts
          .assumeRole({ RoleArn: roleArn, RoleSessionName: this.SESSION_PREFIX + new Date().getTime() })
          .promise();
      AWS.config.credentials.accessKeyId = Credentials.AccessKeyId;
      AWS.config.credentials.sessionToken = Credentials.SessionToken;
      AWS.config.credentials.secretAccessKey = Credentials.SecretAccessKey;
      return Credentials;
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(e);
      fs.unlinkSync(this.TMP_FILE);
      throw new Error('Error. Try it again');
    }
  }

  async mfa() {
    if (this.CF_IS_LOCAL === false) {
      return;
    }

    if (this.AWS_MFA_SERIAL_NUMBER === null) {
      this.serverless.cli.log(
          'Environment var AWS_MFA_SERIAL_NUMBER is required.'
      );
      return;
    }
    const credentials = await this.getCredentials();
    process.env.AWS_ACCESS_KEY_ID = credentials.AccessKeyId;
    process.env.AWS_SECRET_ACCESS_KEY = credentials.SecretAccessKey;
    process.env.AWS_SESSION_TOKEN = credentials.SessionToken;
    this.serverless.providers.aws.cachedCredentials = null;
    this.serverless.providers.aws.credentials = AWS.config.credentials;
  }
}

module.exports = ServerlessAWS2ndFactor;
