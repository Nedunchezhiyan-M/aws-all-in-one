import { STSClient, AssumeRoleCommand, AssumeRoleCommandInput } from '@aws-sdk/client-sts';

export interface AssumeRoleOptions {
  /** AWS Account ID to assume the role in */
  accountId: string;
  /** Name of the IAM role to assume */
  roleName: string;
  /** Session name for the assumed role */
  sessionName: string;
  /** Duration in seconds for the temporary credentials (900-43200) */
  durationSeconds?: number;
  /** External ID for additional security (optional) */
  externalId?: string;
  /** MFA token if required (optional) */
  mfaToken?: string;
  /** Serial number for MFA device (optional) */
  mfaSerialNumber?: string;
  /** Additional policy to apply (optional) */
  policy?: string;
  /** Tags to attach to the session (optional) */
  tags?: Array<{ Key: string; Value: string }>;
  /** Custom STS client instance (optional) */
  stsClient?: STSClient;
}

export interface AssumeRoleResult {
  /** AWS Access Key ID */
  accessKeyId: string;
  /** AWS Secret Access Key */
  secretAccessKey: string;
  /** AWS Session Token */
  sessionToken: string;
  /** Expiration time of the credentials */
  expiration: Date;
}

/**
 * Validates the input parameters for the assumeRole function
 * @param options - The options object to validate
 * @throws {Error} If validation fails
 */
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
  
  // Validate account ID format (12 digits)
  if (!/^\d{12}$/.test(options.accountId)) {
    throw new Error('accountId must be a 12-digit AWS account ID');
  }
  
  // Validate session name (alphanumeric and =,.@-_)
  if (!/^[\w=,.@-]+$/.test(options.sessionName)) {
    throw new Error('sessionName contains invalid characters. Only alphanumeric and =,.@-_ are allowed');
  }
  
  // Validate duration if provided
  if (options.durationSeconds !== undefined) {
    if (options.durationSeconds < 900 || options.durationSeconds > 43200) {
      throw new Error('durationSeconds must be between 900 and 43200 seconds (15 minutes to 12 hours)');
    }
  }
  
  // Validate MFA parameters
  if (options.mfaToken && !options.mfaSerialNumber) {
    throw new Error('mfaSerialNumber is required when mfaToken is provided');
  }
  
  if (options.mfaSerialNumber && !options.mfaToken) {
    throw new Error('mfaToken is required when mfaSerialNumber is provided');
  }
}

/**
 * Assumes an IAM role in another AWS account and returns temporary credentials
 * @param options - Configuration options for assuming the role
 * @returns Promise resolving to temporary AWS credentials
 * @throws {Error} If the operation fails or validation fails
 */
export async function assumeRole(options: AssumeRoleOptions): Promise<AssumeRoleResult> {
  // Validate input parameters
  validateOptions(options);
  
  // Create STS client (use provided one or create new)
  const stsClient = options.stsClient || new STSClient({});
  
  // Build the role ARN
  const roleArn = `arn:aws:iam::${options.accountId}:role/${options.roleName}`;
  
  // Prepare the AssumeRole command input
  const commandInput: AssumeRoleCommandInput = {
    RoleArn: roleArn,
    RoleSessionName: options.sessionName,
    DurationSeconds: options.durationSeconds || 3600,
  };
  
  // Add optional parameters if provided
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
    // Execute the AssumeRole command
    const command = new AssumeRoleCommand(commandInput);
    const response = await stsClient.send(command);
    
    // Validate the response
    if (!response.Credentials) {
      throw new Error('No credentials returned from AWS STS');
    }
    
    const { AccessKeyId, SecretAccessKey, SessionToken, Expiration } = response.Credentials;
    
    if (!AccessKeyId || !SecretAccessKey || !SessionToken || !Expiration) {
      throw new Error('Incomplete credentials returned from AWS STS');
    }
    
    // Return the credentials in the expected format
    return {
      accessKeyId: AccessKeyId,
      secretAccessKey: SecretAccessKey,
      sessionToken: SessionToken,
      expiration: Expiration,
    };
  } catch (error) {
    // Re-throw with more context
    if (error instanceof Error) {
      throw new Error(`Failed to assume role: ${error.message}`);
    }
    throw new Error('Failed to assume role: Unknown error occurred');
  } finally {
    // Clean up the STS client if we created it
    if (!options.stsClient) {
      await stsClient.destroy();
    }
  }
}
