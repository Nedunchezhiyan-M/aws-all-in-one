import { STSClient, AssumeRoleCommand, AssumeRoleCommandInput } from '@aws-sdk/client-sts';

export interface AssumeRoleOptions {
  accountId: string;
  roleName: string;
  sessionName: string;
  durationSeconds?: number;
  externalId?: string;
  mfaToken?: string;
  mfaSerialNumber?: string;
  policy?: string;
  tags?: Array<{ Key: string; Value: string }>;
  stsClient?: STSClient;
}

export interface AssumeRoleResult {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
  expiration: Date;
}

function validateOptions(options: AssumeRoleOptions): void {
  if (!options.accountId) {
    throw new Error('accountId is required');
  }
  
  if (!options.roleName) {
    throw new Error('roleName is required');
  }
  
  if (!options.sessionName) {
    throw new Error('sessionName is required');
  }
  
  if (!/^\d{12}$/.test(options.accountId)) {
    throw new Error('accountId must be a 12-digit AWS account ID');
  }
  
  if (!/^[\w=,.@-]+$/.test(options.sessionName)) {
    throw new Error('sessionName contains invalid characters. Only alphanumeric and =,.@-_ are allowed');
  }
  
  if (options.durationSeconds !== undefined) {
    if (options.durationSeconds < 900 || options.durationSeconds > 43200) {
      throw new Error('durationSeconds must be between 900 and 43200 seconds (15 minutes to 12 hours)');
    }
  }
  
  if (options.mfaToken && !options.mfaSerialNumber) {
    throw new Error('mfaSerialNumber is required when mfaToken is provided');
  }
  
  if (options.mfaSerialNumber && !options.mfaToken) {
    throw new Error('mfaToken is required when mfaSerialNumber is provided');
  }
}

export async function assumeRole(options: AssumeRoleOptions): Promise<AssumeRoleResult> {
  validateOptions(options);
  
  const stsClient = options.stsClient || new STSClient({});
  const roleArn = `arn:aws:iam::${options.accountId}:role/${options.roleName}`;
  
  const commandInput: AssumeRoleCommandInput = {
    RoleArn: roleArn,
    RoleSessionName: options.sessionName,
    DurationSeconds: options.durationSeconds || 3600,
  };
  
  if (options.externalId) {
    commandInput.ExternalId = options.externalId;
  }
  
  if (options.mfaToken && options.mfaSerialNumber) {
    commandInput.SerialNumber = options.mfaSerialNumber;
    commandInput.TokenCode = options.mfaToken;
  }
  
  if (options.policy) {
    commandInput.Policy = options.policy;
  }
  
  if (options.tags && options.tags.length > 0) {
    commandInput.Tags = options.tags;
  }
  
  try {
    const command = new AssumeRoleCommand(commandInput);
    const response = await stsClient.send(command);
    
    if (!response.Credentials) {
      throw new Error('No credentials returned from AWS STS');
    }
    
    const { AccessKeyId, SecretAccessKey, SessionToken, Expiration } = response.Credentials;
    
    if (!AccessKeyId || !SecretAccessKey || !SessionToken || !Expiration) {
      throw new Error('Incomplete credentials returned from AWS STS');
    }
    
    return {
      accessKeyId: AccessKeyId,
      secretAccessKey: SecretAccessKey,
      sessionToken: SessionToken,
      expiration: Expiration,
    };
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to assume role: ${error.message}`);
    }
    throw new Error('Failed to assume role: Unknown error occurred');
  } finally {
    if (!options.stsClient) {
      await stsClient.destroy();
    }
  }
}
