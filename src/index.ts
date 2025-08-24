export * from './assume-role';
export * from './multi-region';
export * from './policy-builder';
export * from './s3-deployer';
export * from './s3-utils';
export * from './kms-utils';
export * from './messaging';
export * from './step-functions';
export * from './lambda-manager';
export * from './lambda-deployer';
export * from './lambda-security';
export * from './credentials-manager';
export * from './sns-email-manager';

export const getCostManager = async () => {
  const { CostManager } = await import('./cost-manager');
  return CostManager;
};

export const getDynamoDBUtils = async () => {
  const { DynamoDBUtils } = await import('./dynamodb-utils');
  return DynamoDBUtils;
};

export const getLambdaManager = async () => {
  const { LambdaManager } = await import('./lambda-manager');
  return LambdaManager;
};

export const getLambdaDeployer = async () => {
  const { LambdaDeployer } = await import('./lambda-deployer');
  return LambdaDeployer;
};

export const getLambdaSecurity = async () => {
  const { LambdaSecurity } = await import('./lambda-security');
  return LambdaSecurity;
};

export type { AssumeRoleOptions, AssumeRoleResult } from './assume-role';
export type { MultiRegionConfig, RegionConfig } from './multi-region';
export type { PolicyDocument, PolicyStatement } from './policy-builder';
export type { S3DeployerOptions, DeployResult } from './s3-deployer';
export type { S3Details, S3NotificationSetup, UploadOptions, S3UtilsOptions } from './s3-utils';
export type { AWSCredentials, CredentialValidationResult } from './credentials-manager';
export type { SNSSubscriptionConfig, SubscriptionResult } from './sns-email-manager';
export type { KMSOptions, EncryptionResult } from './kms-utils';
export type { MessageOptions, PublishResult } from './messaging';
export type { StepFunctionOptions, ExecutionResult } from './step-functions';

export type { 
  CostAnalysisOptions, 
  CostData, 
  CostForecast, 
  AnomalyData, 
  ReservationUtilization, 
  CostOptimizationRecommendation 
} from './cost-manager';

export type { 
  DynamoDBOptions, 
  BatchOperationOptions, 
  QueryOptions, 
  ScanOptions, 
  CostOptimizedQueryOptions, 
  TableMetrics, 
  CostAnalysis 
} from './dynamodb-utils';

export type {
  LambdaFunctionConfig,
  FunctionInfo,
  InvocationResult
} from './lambda-manager';

export type {
  DeploymentConfig,
  DeploymentResult,
  CanaryConfig
} from './lambda-deployer';

export type {
  SecurityPolicy,
  SecurityReport,
  SecurityFinding,
  IAMRoleConfig
} from './lambda-security';
