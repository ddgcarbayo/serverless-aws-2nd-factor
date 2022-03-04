# serverless-aws-2nd-factor
2nd factor for AWS serverless local projects

### Important
Recommended for local development working with serverless-offline
Only works if SERVERLESS_LOCAL_ENV env var is 1 or force custom var is true

```
npm install --save-dev serverless-aws-2nd-factor
```

### serverless.yml
```
plugins:
  - serverless-offline
  - serverless-aws-2nd-factor
```

### Custom variables
```
aws-2nd-factor:
  # TMP credentials storage
  # default: os.tmpdir() + '/.2nd-aws-credentials.tmp'
  tmpFile: /.cred-files.tmp
  # Base profile. We use this profile to login with MFA
  baseProfile: cf
  # Profile to be assumed
  localProfile: cf-dev
  # Session time (minutes)
  maxTime: 43200
  # MFA serial number. Preferred in env vars
  mfaSerialNumber: arn:aws:iam::{aws_account}:mfa/{aws_user}
  # Use plugin (not recommended for cloud environment, only for local)
  force: false
  # AWS session prefix
  sessionPrefix: cfsvl-
```

### .aws/config
```
[cf]
region = us-west-1
output = json
[cf-dev]
region = us-west-1
output = json
```

### .aws/credentials
```
[cf]
aws_access_key_id = XXXXXXXXXX
aws_secret_access_key = XXXXXXXXXXXXXX
mfa_serial = arn:aws:iam::{accountId}:mfa/{loginUserId}
[cf-dev]
role_arn = arn:aws:iam::XXXXXXXXX:role/{role-to-be-assumed}
source_profile = cf
role_session_name = MFAUser
mfa_serial = arn:aws:iam::XXXXXXXXXXX:mfa/{loginUserId}
```
