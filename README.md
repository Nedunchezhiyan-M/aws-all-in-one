# 🚀 AWS All In One

[![npm version](https://badge.fury.io/js/aws-all-in-one.svg)](https://badge.fury.io/js/aws-all-in-one)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/node/v/aws-all-in-one)](https://nodejs.org/)
[![Coverage](https://img.shields.io/codecov/c/github/Nedunchezhiyan-M/aws-all-in-one)](https://codecov.io/gh/Nedunchezhiyan-M/aws-all-in-one)

A comprehensive toolkit for AWS operations including multi-region clients, IAM policy builder, assume role, S3 deployment, KMS utilities, messaging, and Step Functions helpers. Built with AWS SDK v3 and designed for modern Node.js applications.

## ✨ Features

- 🔐 **Multi-Region Management** - Automatic failover and region management for AWS services
- 🏗️ **IAM Policy Builder** - Programmatically build least-privilege IAM policies
- 🔑 **Cross-Account AssumeRole** - Secure utility for AWS cross-account role assumption
- 📦 **S3 Static Website Deployer** - Deploy static sites with CloudFront invalidation
- 🗂️ **S3 Utilities** - File uploads, pre-signed URLs, notifications setup, and IAM management
- 🔒 **KMS Utilities** - Simplified encryption/decryption operations
- 📨 **Unified Messaging** - Integrate EventBridge, SNS, and SQS with retries and dead-letter handling
- ⚡ **Step Functions Helper** - Modern wrapper for invoking and monitoring Step Functions
- 💰 **Cost Manager** - Comprehensive cost analysis, forecasting, and optimization recommendations
- 🗄️ **DynamoDB Utilities** - Cost-optimized operations with batch processing and performance analysis
- 🚀 **Lambda Manager** - Complete Lambda function lifecycle management with best practices
- 🚀 **Lambda Deployer** - Production-ready deployment strategies (blue-green, canary) with CloudWatch scheduling and retry logic
- 🔒 **Lambda Security** - Automated security scanning, IAM role generation, and compliance
- 🔑 **Credentials Manager** - Configure AWS credentials programmatically without external CLI
- 📧 **SNS Email Manager** - Automatic email subscriptions and verification for SNS topics
- 🪶 **Lightweight** - Minimal package size with no unnecessary dependencies
- 🚀 **Modern** - Written in TypeScript, transpiles to ESM + CommonJS
- 🧪 **Testable** - Fully tested with Jest and mocked AWS SDK

## 📦 Installation

```bash
npm install aws-all-in-one
```

```bash
yarn add aws-all-in-one
```

```bash
pnpm add aws-all-in-one
```

## 🛠️ Usage

### 1. Multi-Region AWS Client Manager

**Use Case**: Automatically handle AWS service failures across multiple regions with automatic failover.

```typescript
import { createDefaultMultiRegionManager } from 'aws-all-in-one/multi-region';

const manager = createDefaultMultiRegionManager({
  accessKeyId: 'YOUR_ACCESS_KEY',
  secretAccessKey: 'YOUR_SECRET_KEY'
});

// Execute with automatic failover
const result = await manager.executeWithFailover(
  async (client) => {
    // Your AWS operation here
    return await someOperation(client);
  },
  {
    onFailover: (fromRegion, toRegion, error) => {
      console.log(`Failed over from ${fromRegion} to ${toRegion}:`, error);
    }
  }
);
```

### 2. IAM Policy Builder

**Use Case**: Programmatically build least-privilege IAM policies with a fluent API.

```typescript
import { PolicyBuilder, PolicyTemplates } from 'aws-all-in-one/policy-builder';

// Build custom policy
const policy = new PolicyBuilder()
  .allow(['s3:GetObject', 's3:PutObject'], 'arn:aws:s3:::my-bucket/*')
  .deny(['s3:DeleteObject'], 'arn:aws:s3:::my-bucket/*')
  .withCondition('Allow', 's3:GetObject', 'arn:aws:s3:::my-bucket/*', {
    StringEquals: { 'aws:PrincipalTag/Environment': 'Production' }
  })
  .build();

// Use predefined templates
const s3Policy = PolicyTemplates.s3ReadWrite('my-bucket');
const lambdaPolicy = PolicyTemplates.lambdaInvoke('my-function');
```

### 3. Cross-Account AssumeRole

**Use Case**: Securely assume AWS roles across different accounts with comprehensive validation.

```typescript
import { assumeRole } from 'aws-all-in-one/assume-role';

const credentials = await assumeRole({
  accountId: 'YOUR_ACCOUNT_ID', // Replace with your actual AWS account ID
  roleName: 'CrossAccountRole',
  sessionName: 'mySession',
  durationSeconds: 3600
});
```

### 4. S3 Static Website Deployer

**Use Case**: Deploy static websites to S3 with CloudFront invalidation and presigned URLs.

```typescript
import { createS3Deployer } from 'aws-all-in-one/s3-deployer';

const deployer = createS3Deployer({
  bucketName: 'my-website-bucket',
  sourcePath: './dist',
  cloudFrontDistributionId: 'E1234567890ABC'
});

const result = await deployer.deploy();
```

### 5. S3 Utilities

**Use Case**: Comprehensive S3 operations including file uploads, notifications setup, and IAM management.

```typescript
import { createS3Utils, S3Helpers } from 'aws-all-in-one/s3-utils';

const s3Utils = createS3Utils({
  region: 'us-east-1',
  credentials: {
    accessKeyId: 'YOUR_ACCESS_KEY',
    secretAccessKey: 'YOUR_SECRET_KEY'
  }
});

// Upload file with multipart support
const result = await s3Utils.uploadFile(file, s3Details, {
  isPublic: true,
  customPrefix: 'public-images'
});

// Generate pre-signed URL
const url = await s3Utils.getPreSignedUrl('file-key', s3Details, 7200);

// Setup complete S3 notifications (SNS + IAM + bucket config)
const setup = await s3Utils.setupS3Notifications(s3Details);

// Setup S3 notifications with automatic email subscriptions
const notificationSetup = await s3Utils.setupS3NotificationsWithEmails(
  s3Details,
  ['admin@company.com', 'dev@company.com', 'support@company.com']
);

// Get IAM username
const username = await s3Utils.getIamUserName(s3Details);
```

### 6. Cost Manager

**Use Case**: Comprehensive cost analysis, forecasting, and optimization recommendations for AWS services.

```typescript
import { costManager } from 'aws-all-in-one/cost-manager';

// Get cost and usage data
const costData = await costManager.getCostAndUsage({
  startDate: new Date('2024-01-01'),
  endDate: new Date('2024-01-31'),
  granularity: 'MONTHLY'
});

// Get cost forecast
const forecast = await costManager.getCostForecast({
  startDate: new Date('2024-02-01'),
  endDate: new Date('2024-02-29')
});

// Get cost optimization recommendations
const recommendations = await costManager.getCostOptimizationRecommendations({
  startDate: new Date('2024-01-01'),
  endDate: new Date('2024-01-31')
});

// Calculate service-specific costs
const ec2Cost = await costManager.calculateServiceCost('AmazonEC2', {
  startDate: new Date('2024-01-01'),
  endDate: new Date('2024-01-31')
});
```

### 7. DynamoDB Utilities

**Use Case**: Cost-optimized DynamoDB operations with batch processing, performance analysis, and cost monitoring.

```typescript
import { createDynamoDBUtils } from 'aws-all-in-one/dynamodb-utils';

const dynamoDB = createDynamoDBUtils({
  tableName: 'my-table',
  region: 'us-east-1'
});

// Batch operations for cost efficiency
await dynamoDB.batchWrite([
  { put: { id: '1', data: 'value1' } },
  { put: { id: '2', data: 'value2' } },
  { delete: { id: '3' } }
]);

// Cost-optimized queries
const items = await dynamoDB.query('id = :id', { ':id': '1' }, {
  useGSI: true,
  maxCost: 0.01
});

// Get cost analysis
const costAnalysis = await dynamoDB.getCostAnalysis();

// Performance optimization recommendations
const optimization = await dynamoDB.optimizeQueryPerformance('id = :id', { ':id': '1' });

// Helper utilities
const uniqueName = S3Helpers.generateUniqueFilename('document.pdf', 'uploads');
const isValidBucket = S3Helpers.validateBucketName('my-bucket-123');
const fileSize = S3Helpers.formatFileSize(1048576); // "1 MB"
```

### 6. KMS Encryption/Decryption

**Use Case**: Simplified encryption/decryption operations with encryption contexts and data key generation.

```typescript
import { createKMSUtils, EncryptionContexts } from 'aws-all-in-one/kms-utils';

const kms = createKMSUtils({
  keyId: 'arn:aws:kms:us-east-1:YOUR_ACCOUNT_ID:key/YOUR_KEY_ID'
});

// Encrypt/Decrypt data
const encrypted = await kms.encrypt('sensitive data');
const decrypted = await kms.decrypt(encrypted.encryptedData);
```

### 7. Unified Messaging

**Use Case**: Integrate EventBridge, SNS, and SQS with retries, dead-letter handling, and unified interfaces.

```typescript
import { createMessagingUtils } from 'aws-all-in-one/messaging';

const messaging = createMessagingUtils({
  region: 'us-east-1',
  deadLetterQueueUrl: 'https://sqs.us-east-1.amazonaws.com/YOUR_ACCOUNT_ID/dlq'
});

// Publish to SNS, SQS, or EventBridge
await messaging.publishToSNS('topic-arn', { message: 'Hello World' });
await messaging.sendToSQS('queue-url', { data: 'message data' });
```

### 8. Lambda Deployment (Advanced)

**Use Case**: Deploy Lambda functions with blue-green and canary strategies using production-ready deployment patterns.

```typescript
import { LambdaDeployer } from 'aws-all-in-one/lambda-deployer';

// Option 1: Use with default configuration
const deployer = new LambdaDeployer();

// Option 2: Configure with your own AWS details
const deployer = new LambdaDeployer({
  region: 'us-west-2',
  accountId: '987654321098' // Your AWS account ID
});

// Blue-green deployment
const blueGreenResult = await deployer.blueGreenDeploy({
  functionName: 'my-function',
  code: Buffer.from('updated-function-code'),
  description: 'Production deployment v2.0'
});

// Canary deployment with traffic shifting
const canaryResult = await deployer.canaryDeploy({
  functionName: 'my-function',
  trafficPercent: 10,
  duration: 30, // 30 minutes
  evaluationCriteria: {
    errorRate: 0.01,
    latency: 1000
  }
}, Buffer.from('canary-function-code'));

// Rollback if needed
await deployer.rollbackToVersion('my-function', '1');
```

### 9. Step Functions Helper

**Use Case**: Modern wrapper for invoking and monitoring Step Functions with retry patterns and execution management.

```typescript
import { createStepFunctionsHelper, ExecutionPatterns } from 'aws-all-in-one/step-functions';

const sfn = createStepFunctionsHelper({
  stateMachineArn: 'arn:aws:states:us-east-1:YOUR_ACCOUNT_ID:stateMachine:MyWorkflow'
});

// Start execution and wait for completion
const result = await sfn.executeAndWait('my-execution', { input: 'data' });

// Use retry pattern
const output = await ExecutionPatterns.retryOnFailure(sfn, 'my-execution', { input: 'data' }, 3);
```

### 10. AWS Credentials Management

**Use Case**: Configure AWS credentials programmatically without external CLI or environment variables.

```typescript
import { CredentialsManager } from 'aws-all-in-one/credentials-manager';

// Configure credentials directly in your code
const credentials = {
  accessKeyId: 'YOUR_ACCESS_KEY',
  secretAccessKey: 'YOUR_SECRET_KEY',
  region: 'us-east-1'
};

// Test and configure credentials
const isValid = await CredentialsManager.testAndConfigure(credentials);
if (isValid) {
  console.log('✅ Credentials configured successfully!');
}

// Check which credentials are currently active
const current = await CredentialsManager.getCurrentCredentials();
console.log(`Using credentials from: ${current.source}`);

// Test current credentials without changing them
const status = await CredentialsManager.testCurrentCredentials();
```

### 11. SNS Email Management

**Use Case**: Automatically subscribe email addresses to SNS topics and manage subscriptions.

```typescript
import { SNSEmailManager } from 'aws-all-in-one/sns-email-manager';

// Subscribe multiple emails to an SNS topic
const subscriptions = await SNSEmailManager.subscribeEmails({
  topicArn: 'arn:aws:sns:us-east-1:123456789012:my-topic',
  emailAddresses: ['admin@company.com', 'dev@company.com'],
  protocol: 'email'
});

// Check subscription status
for (const subscription of subscriptions) {
  const status = await SNSEmailManager.checkSubscriptionStatus(subscription.subscriptionArn);
  console.log(`${subscription.email}: ${status.status}`);
}

// List all subscriptions for a topic
const allSubscriptions = await SNSEmailManager.listTopicSubscriptions(topicArn);
console.log('All email subscriptions:', allSubscriptions);
```

## ⚡ Use Cases

### Multi-Account Infrastructure Management
**Scenario**: Deploy applications across multiple AWS accounts using cross-account role assumption and S3 deployment.
**Functions**: `assumeRole()`, `createS3Deployer()`

### Secure Data Processing Pipeline
**Scenario**: Process encrypted messages with KMS, trigger Step Functions workflows, and handle failures gracefully.
**Functions**: `createKMSUtils()`, `createMessagingUtils()`, `createStepFunctionsHelper()`

### High-Availability AWS Operations
**Scenario**: Ensure AWS operations continue working even if one region fails using automatic failover.
**Functions**: `createDefaultMultiRegionManager()`

### IAM Policy Automation
**Scenario**: Generate least-privilege IAM policies programmatically for different environments and services.
**Functions**: `PolicyBuilder`, `PolicyTemplates`

### Cost Optimization & Monitoring
**Scenario**: Monitor AWS costs, detect anomalies, and get automated recommendations for cost savings.
**Functions**: `costManager`, `getCostOptimizationRecommendations()`

### DynamoDB Performance & Cost Management
**Scenario**: Optimize DynamoDB operations with batch processing, cost analysis, and performance recommendations.
**Functions**: `createDynamoDBUtils()`, `optimizeQueryPerformance()`

### AWS Credentials Management
**Scenario**: Configure AWS credentials programmatically without external CLI or environment variables.
**Functions**: `CredentialsManager.testAndConfigure()`, `CredentialsManager.getCurrentCredentials()`

### SNS Email Notifications
**Scenario**: Automatically subscribe multiple email addresses to SNS topics for notifications.
**Functions**: `SNSEmailManager.subscribeEmails()`, `setupS3NotificationsWithEmails()`

## 🔐 Security Notes

### Best Practices

1. **Never log credentials** - All utilities are designed to never expose sensitive information
2. **Use external IDs** - Always provide external IDs when assuming roles in third-party accounts
3. **Apply least privilege** - Use the policy builder to create minimal required permissions
4. **Enable encryption** - Use KMS utilities for all sensitive data
5. **Monitor executions** - Use Step Functions helper to track workflow execution
6. **Configure AWS details** - Provide your own region and account ID when using Lambda Deployer
7. **Validate inputs** - All Lambda deployment methods now validate inputs for security

## 📋 API Reference

### Multi-Region Manager

```typescript
interface MultiRegionConfig {
  regions: RegionConfig[];
  defaultRegion?: string;
  enableFailover?: boolean;
  maxRetries?: number;
  retryDelay?: number;
}

class MultiRegionManager {
  getClient<T>(region: string): T | undefined;
  executeWithFailover<T, R>(operation: (client: T) => Promise<R>): Promise<R>;
  healthCheck<T>(operation: (client: T) => Promise<boolean>): Promise<Map<string, boolean>>;
}
```

### Policy Builder

```typescript
class PolicyBuilder {
  allow(actions: string | string[], resources: string | string[], sid?: string): this;
  deny(actions: string | string[], resources: string | string[], sid?: string): this;
  withCondition(effect: 'Allow' | 'Deny', actions: string | string[], resources: string | string[], condition: Record<string, any>): this;
  build(): PolicyBuilder;
  toJSON(): string;
}
```

### S3 Deployer

```typescript
interface S3DeployerOptions {
  bucketName: string;
  sourcePath: string;
  region?: string;
  cloudFrontDistributionId?: string;
  cacheControl?: string;
  acl?: string;
}

class S3Deployer {
  deploy(): Promise<DeployResult>;
  generatePresignedUrl(key: string, expiresIn?: number): Promise<string>;
}
```

### S3 Utils

```typescript
interface S3Details {
  bucketName: string;
  bucketRegion: string;
  accessKeyId: string;
  secretAccessKey: string;
}

interface S3NotificationSetup {
  topicArn: string;
  subscriptionArn: string;
  response: any;
}
```

### Cost Manager

```typescript
interface CostAnalysisOptions {
  startDate: Date;
  endDate: Date;
  granularity?: 'DAILY' | 'MONTHLY' | 'HOURLY';
  metrics?: string[];
  groupBy?: Array<{ Type: string; Key?: string }>;
  filter?: any;
}

class CostManager {
  getCostAndUsage(options: CostAnalysisOptions): Promise<CostData>;
  getCostForecast(options: CostAnalysisOptions): Promise<CostForecast>;
  getAnomalies(options: CostAnalysisOptions): Promise<AnomalyData[]>;
  getCostOptimizationRecommendations(options: CostAnalysisOptions): Promise<CostOptimizationRecommendation[]>;
  calculateServiceCost(service: string, options: CostAnalysisOptions): Promise<number>;
}
```

### DynamoDB Utils

```typescript
interface DynamoDBOptions {
  tableName: string;
  region?: string;
  dynamoDBClient?: DynamoDBClient;
}

interface CostOptimizedQueryOptions {
  maxCost?: number;
  useGSI?: boolean;
  preferConsistentRead?: boolean;
}

class DynamoDBUtils {
  putItem(item: Record<string, any>): Promise<void>;
  getItem(key: Record<string, any>): Promise<Record<string, any> | null>;
  query(keyConditionExpression: string, expressionAttributeValues: Record<string, any>, options?: CostOptimizedQueryOptions): Promise<Record<string, any>[]>;
  batchWrite(items: Array<{ put?: Record<string, any>; delete?: Record<string, any> }>): Promise<void>;
  getCostAnalysis(): Promise<CostAnalysis>;
  optimizeQueryPerformance(keyConditionExpression: string, expressionAttributeValues: Record<string, any>): Promise<{ optimizedExpression: string; estimatedCost: number; recommendations: string[] }>;
}

class S3Utils {
  uploadFile(file: { buffer: Buffer; originalname: string; mimetype: string }, s3Details: S3Details, options?: UploadOptions): Promise<any>;
  getPreSignedUrl(key: string, s3Details: S3Details, expiresIn?: number): Promise<string>;
  setupS3Notifications(s3Details: S3Details, logger?: any): Promise<S3NotificationSetup>;
  getIamUserName(s3Details: S3Details): Promise<string>;
  getSNSSubscriptionAttributes(subscriptionArn: string, s3Details: S3Details, logger?: any): Promise<any>;
  getSubscriptionArnByEndpoint(topicArn: string, s3Details: S3Details, endpoint: string, logger?: any): Promise<string | undefined>;
  setupS3NotificationsWithEmails(s3Details: S3Details, emailAddresses: string[]): Promise<S3NotificationSetup & { emailSubscriptions: any[] }>;
}

// Helper functions
const S3Helpers = {
  generateUniqueFilename(originalName: string, prefix?: string): string;
  validateBucketName(bucketName: string): boolean;
  formatFileSize(bytes: number): string;
};
```

### KMS Utils

```typescript
class KMSUtils {
  encrypt(data: string | Buffer, encryptionContext?: Record<string, string>): Promise<EncryptionResult>;
  decrypt(encryptedData: Buffer, encryptionContext?: Record<string, string>): Promise<DecryptionResult>;
  generateDataKey(keySpec?: 'AES_128' | 'AES_256'): Promise<DataKeyResult>;
}
```

### Messaging Utils

```typescript
class MessagingUtils {
  publishToSNS(topicArn: string, message: string | object, subject?: string): Promise<PublishResult>;
  sendToSQS(queueUrl: string, message: string | object, attributes?: Record<string, string>): Promise<PublishResult>;
  putEvent(eventBusName: string, source: string, detailType: string, detail: any): Promise<PublishResult>;
  processSQSMessages<T>(queueUrl: string, handler: MessageHandler<T>): Promise<void>;
}
```

### Step Functions Helper

```typescript
class StepFunctionsHelper {
  startExecution(name: string, input: ExecutionInput): Promise<ExecutionResult>;
  executeAndWait(name: string, input: ExecutionInput): Promise<ExecutionStatus>;
  getExecutionStatus(executionArn: string): Promise<ExecutionStatus>;
  listExecutions(options?: { maxResults?: number; statusFilter?: string }): Promise<ExecutionStatus[]>;
}
```

### Credentials Manager

```typescript
interface AWSCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  region?: string;
  sessionToken?: string;
}

interface CredentialValidationResult {
  isValid: boolean;
  accountId?: string;
  userId?: string;
  arn?: string;
  errors: string[];
}

class CredentialsManager {
  static configureCredentials(credentials: AWSCredentials): void;
  static validateCredentials(credentials?: AWSCredentials): Promise<CredentialValidationResult>;
  static testAndConfigure(credentials: AWSCredentials): Promise<boolean>;
  static getCurrentCredentials(): Promise<{ source: 'environment' | 'cli' | 'iam-role' | 'none'; accountId?: string; userId?: string; region?: string }>;
  static testCurrentCredentials(): Promise<CredentialValidationResult>;
}
```

### SNS Email Manager

```typescript
interface SNSSubscriptionConfig {
  topicArn: string;
  emailAddresses: string[];
  protocol: 'email' | 'email-json';
  autoConfirm?: boolean;
}

interface SubscriptionResult {
  email: string;
  subscriptionArn: string;
  status: 'pending' | 'confirmed' | 'failed';
  error?: string;
}

class SNSEmailManager {
  static subscribeEmails(config: SNSSubscriptionConfig, awsCredentials?: any): Promise<SubscriptionResult[]>;
  static checkSubscriptionStatus(subscriptionArn: string, awsCredentials?: any): Promise<{ status: string; confirmed: boolean }>;
  static resendConfirmation(subscriptionArn: string, awsCredentials?: any): Promise<void>;
  static listTopicSubscriptions(topicArn: string, awsCredentials?: any): Promise<Array<{ email: string; status: string; subscriptionArn: string }>>;
}
```

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built with [AWS SDK v3](https://github.com/aws/aws-sdk-js-v3)
- Tested with [Jest](https://jestjs.io/)
- Built with [tsup](https://github.com/egoist/tsup)
- TypeScript support and modern ES modules

## 📞 Support

- 📧 **Email**: nedunchezhiyancse@gmail.com
- 🐛 **Issues**: [GitHub Issues](https://github.com/Nedunchezhiyan-M/aws-all-in-one/issues)
- 📖 **Documentation**: [GitHub Wiki](https://github.com/Nedunchezhiyan-M/aws-all-in-one/wiki)

---

**Made with ❤️ for the AWS community**
