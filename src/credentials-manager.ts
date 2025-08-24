export interface AWSCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  region?: string;
  sessionToken?: string;
}

export interface CredentialValidationResult {
  isValid: boolean;
  accountId?: string;
  userId?: string;
  arn?: string;
  errors: string[];
}

export class CredentialsManager {
  
  // Configure AWS credentials programmatically
  static configureCredentials(credentials: AWSCredentials): void {
    // Set environment variables for the current process
    process.env.AWS_ACCESS_KEY_ID = credentials.accessKeyId;
    process.env.AWS_SECRET_ACCESS_KEY = credentials.secretAccessKey;
    
    if (credentials.region) {
      process.env.AWS_REGION = credentials.region;
    }
    
    if (credentials.sessionToken) {
      process.env.AWS_SESSION_TOKEN = credentials.sessionToken;
    }

    console.log('AWS credentials configured successfully');
  }

  // Validate credentials by making a test API call
  static async validateCredentials(credentials?: AWSCredentials): Promise<CredentialValidationResult> {
    try {
      // Use existing @aws-sdk/client-sts package
      const { STSClient, GetCallerIdentityCommand } = require('@aws-sdk/client-sts');
      
      const stsClient = new STSClient({
        credentials: credentials ? {
          accessKeyId: credentials.accessKeyId,
          secretAccessKey: credentials.secretAccessKey,
          sessionToken: credentials.sessionToken
        } : undefined,
        region: credentials?.region || process.env.AWS_REGION || 'us-east-1'
      });

      const result = await stsClient.send(new GetCallerIdentityCommand({}));

      return {
        isValid: true,
        accountId: result.Account,
        userId: result.UserId,
        arn: result.Arn,
        errors: []
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        isValid: false,
        errors: [errorMessage || 'Failed to validate credentials']
      };
    }
  }

  // Test credentials and configure if valid
  static async testAndConfigure(credentials: AWSCredentials): Promise<boolean> {
    console.log('🔑 Testing AWS credentials...');
    
    const validation = await this.validateCredentials(credentials);
    
    if (validation.isValid) {
      this.configureCredentials(credentials);
      console.log(`Credentials valid! Account: ${validation.accountId}`);
      return true;
    } else {
      console.log('Invalid credentials:');
      validation.errors.forEach(error => console.log(`   - ${error}`));
      return false;
    }
  }

  // Check which credentials are currently active
  static async getCurrentCredentials(): Promise<{
    source: 'environment' | 'cli' | 'iam-role' | 'none';
    accountId?: string;
    userId?: string;
    region?: string;
  }> {
    try {
      const { STSClient, GetCallerIdentityCommand } = require('@aws-sdk/client-sts');
      
      // Check environment variables first
      if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
        const stsClient = new STSClient({ region: process.env.AWS_REGION || 'us-east-1' });
        const result = await stsClient.send(new GetCallerIdentityCommand({}));
        
        return {
          source: 'environment',
          accountId: result.Account,
          userId: result.UserId,
          region: process.env.AWS_REGION
        };
      }

      // Check CLI credentials
      try {
        const stsClient = new STSClient({ region: 'us-east-1' });
        const result = await stsClient.send(new GetCallerIdentityCommand({}));
        
        return {
          source: 'cli',
          accountId: result.Account,
          userId: result.UserId,
          region: 'us-east-1' // Default CLI region
        };
      } catch {
      }

      // Check IAM role (if running on AWS)
      try {
        const stsClient = new STSClient({ region: 'us-east-1' });
        const result = await stsClient.send(new GetCallerIdentityCommand({}));
        
        return {
          source: 'iam-role',
          accountId: result.Account,
          userId: result.UserId,
          region: 'us-east-1'
        };
      } catch {
      }

      return { source: 'none' };

    } catch {
      return { source: 'none' };
    }
  }

  // Test current credentials without changing them
  static async testCurrentCredentials(): Promise<CredentialValidationResult> {
    const current = await this.getCurrentCredentials();
    
    if (current.source === 'none') {
      return {
        isValid: false,
        errors: ['No AWS credentials found']
      };
    }

    // Test the current credentials
    return this.validateCredentials();
  }
}
