import { S3Client, PutBucketNotificationConfigurationCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { SNSClient, CreateTopicCommand, SubscribeCommand, ListTopicsCommand, ListSubscriptionsByTopicCommand, SetTopicAttributesCommand, GetSubscriptionAttributesCommand } from '@aws-sdk/client-sns';
import { STSClient, GetCallerIdentityCommand } from '@aws-sdk/client-sts';
import { IAMClient, CreatePolicyCommand, AttachUserPolicyCommand, GetPolicyCommand, ListAttachedUserPoliciesCommand } from '@aws-sdk/client-iam';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Upload } from '@aws-sdk/lib-storage';

export interface S3Details {
  bucketName: string;
  bucketRegion: string;
  accessKeyId: string;
  secretAccessKey: string;
}

export interface S3NotificationSetup {
  topicArn: string;
  subscriptionArn: string;
  response: any;
}

export interface UploadOptions {
  isPublic?: boolean;
  customPrefix?: string;
  contentType?: string;
}

export interface S3UtilsOptions {
  region?: string;
  credentials?: {
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken?: string;
  };
  s3Client?: S3Client;
  snsClient?: SNSClient;
  stsClient?: STSClient;
  iamClient?: IAMClient;
}

/**
 * Comprehensive S3 Utilities
 * Provides file uploads, pre-signed URLs, notifications setup, and IAM management
 */
export class S3Utils {
  private options: S3UtilsOptions;
  private s3Client: S3Client;
  private snsClient: SNSClient;
  private stsClient: STSClient;
  private iamClient: IAMClient;

  constructor(options: S3UtilsOptions = {}) {
    this.options = {
      region: 'us-east-1',
      ...options,
    };

    this.s3Client = options.s3Client || new S3Client({
      region: this.options.region,
      credentials: this.options.credentials,
    });

    this.snsClient = options.snsClient || new SNSClient({
      region: this.options.region,
      credentials: this.options.credentials,
    });

    this.stsClient = options.stsClient || new STSClient({
      region: this.options.region,
      credentials: this.options.credentials,
    });

    this.iamClient = options.iamClient || new IAMClient({
      region: this.options.region,
      credentials: this.options.credentials,
    });
  }

  /**
   * Upload a file to S3 with multipart upload support
   */
  async uploadFile(
    file: { buffer: Buffer; originalname: string; mimetype: string },
    s3Details: S3Details,
    options: UploadOptions = {}
  ): Promise<any> {
    const { isPublic = false, customPrefix = 'uploads', contentType } = options;
    
    const fileName = isPublic 
      ? this.generatePublicFileName(file.originalname, customPrefix)
      : this.generateCustomFileName(file.originalname);

    const upload = new Upload({
      client: new S3Client({
        region: s3Details.bucketRegion,
        credentials: {
          accessKeyId: s3Details.accessKeyId,
          secretAccessKey: s3Details.secretAccessKey,
        },
      }),
      params: {
        Bucket: s3Details.bucketName,
        Body: file.buffer,
        Key: fileName,
        ContentType: contentType || file.mimetype,
      }
    });

    return upload.done();
  }

  /**
   * Generate a pre-signed URL for S3 object access
   */
  async getPreSignedUrl(key: string, s3Details: S3Details, expiresIn: number = 3600): Promise<string> {
    const client = new S3Client({
      region: s3Details.bucketRegion,
      credentials: {
        accessKeyId: s3Details.accessKeyId,
        secretAccessKey: s3Details.secretAccessKey
      }
    });

    const command = new GetObjectCommand({
      Bucket: s3Details.bucketName,
      Key: key,
    });

    return getSignedUrl(client, command, { expiresIn });
  }

  /**
   * Complete S3 notifications setup including SNS topic, subscription, and bucket configuration
   */
  async setupS3Notifications(s3Details: S3Details, logger?: any): Promise<S3NotificationSetup> {
    try {
      if (logger) logger.info('Setting up S3 notifications...');
      
      const userName = await this.getIamUserName(s3Details);
      if (logger) logger.info(`Username fetched: ${userName}`);

      await this.createAndAttachPolicy(userName, s3Details, logger);
      if (logger) logger.info('IAM Policy created and attached');

      const topicArn = await this.createSNSTopic(s3Details, logger);
      if (logger) logger.info(`SNS Topic created: ${topicArn}`);

      const subscriptionArn = await this.subscribeToSNSTopic(topicArn, s3Details, logger);
      if (logger) logger.info('API endpoint subscribed to SNS topic');

      const response = await this.setS3EventNotification(topicArn, subscriptionArn, s3Details, logger);
      if (logger) logger.info(`S3 event notifications configured for bucket: ${s3Details.bucketName}`);

      return { topicArn, subscriptionArn, response };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (logger) logger.error(`Error setting up S3 notifications: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Create or find existing SNS topic for S3 event notifications
   */
  private async createSNSTopic(s3Details: S3Details, logger?: any): Promise<string> {
    const topicName = 'S3FileUploadEventTopic';

    try {
      // Check for existing topic
      const { Topics } = await this.snsClient.send(new ListTopicsCommand({}));
             const existingTopic = Topics?.find((topic: any) => 
         topic.TopicArn?.split(':').pop() === topicName
       );

      if (existingTopic) {
        if (logger) logger.info(`SNS Topic '${topicName}' already exists`);
        await this.updateTopicPolicy(existingTopic.TopicArn!, s3Details.bucketName, logger);
        return existingTopic.TopicArn!;
      }

      // Create new topic
      const command = new CreateTopicCommand({ Name: topicName });
      const response = await this.snsClient.send(command);

      if (!response.TopicArn) {
        throw new Error('Failed to create SNS topic');
      }

      // Set topic policy
      await this.updateTopicPolicy(response.TopicArn, s3Details.bucketName, logger);
      if (logger) logger.info(`Created new SNS Topic '${topicName}'`);

      return response.TopicArn;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Error creating SNS topic: ${errorMessage}`);
    }
  }

  /**
   * Update SNS topic policy to allow S3 to publish
   */
  private async updateTopicPolicy(topicArn: string, bucketName: string, logger?: any): Promise<void> {
    try {
      const topicPolicy = {
        Version: '2012-10-17',
        Statement: [
          {
            Sid: 'AllowS3ToPublishToSNS',
            Effect: 'Allow',
            Principal: {
              Service: 's3.amazonaws.com'
            },
            Action: 'SNS:Publish',
            Resource: topicArn,
            Condition: {
              StringEquals: {
                'aws:SourceAccount': topicArn.split(':')[4]
              },
              ArnLike: {
                'aws:SourceArn': `arn:aws:s3:*:*:${bucketName}`
              }
            }
          }
        ]
      };

      await this.snsClient.send(new SetTopicAttributesCommand({
        TopicArn: topicArn,
        AttributeName: 'Policy',
        AttributeValue: JSON.stringify(topicPolicy)
      }));

      if (logger) logger.info(`Updated SNS topic policy for topic: ${topicArn}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Error updating topic policy: ${errorMessage}`);
    }
  }

  /**
   * Subscribe endpoint to SNS topic
   */
  private async subscribeToSNSTopic(
    topicArn: string, 
    s3Details: S3Details, 
    logger?: any,
    endpoint?: string
  ): Promise<string> {
    const defaultEndpoint = 'https://your-api-endpoint.com/webhook';
    const webhookEndpoint = endpoint || defaultEndpoint;

    try {
      // Check existing subscriptions
      const listCommand = new ListSubscriptionsByTopicCommand({ TopicArn: topicArn });
      const { Subscriptions } = await this.snsClient.send(listCommand);

      const existingSubscription = Subscriptions?.find((sub: any) =>
        sub.Endpoint === webhookEndpoint && sub.Protocol === 'https'
      );

      if (existingSubscription) {
        if (logger) logger.info(`Endpoint ${webhookEndpoint} already subscribed to topic ${topicArn}`);
        return existingSubscription.SubscriptionArn || '';
      }

      // Create new subscription
      const command = new SubscribeCommand({
        Protocol: 'https',
        TopicArn: topicArn,
        Endpoint: webhookEndpoint,
      });

      const response = await this.snsClient.send(command);
      if (logger) logger.info(`Successfully subscribed ${webhookEndpoint} to topic ${topicArn}`);

      return response.SubscriptionArn || '';
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Error managing SNS subscription: ${errorMessage}`);
    }
  }

  /**
   * Configure S3 bucket to send events to SNS topic
   */
  private async setS3EventNotification(
    topicArn: string, 
    subscriptionArn: string, 
    s3Details: S3Details, 
    logger?: any
  ): Promise<any> {
    try {
      const command = new PutBucketNotificationConfigurationCommand({
        Bucket: s3Details.bucketName,
        NotificationConfiguration: {
          TopicConfigurations: [
            {
              TopicArn: topicArn,
              Events: [
                's3:ObjectCreated:*',
                's3:ObjectRemoved:*',
                's3:ObjectTagging:*'
              ],
            }
          ]
        }
      });

      const response = await this.s3Client.send(command);
      if (logger) logger.info(`S3 event notifications configured for bucket: ${s3Details.bucketName}`);

      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Error configuring S3 event notifications: ${errorMessage}`);
    }
  }

  /**
   * Create and attach IAM policy for SNS and S3 notifications
   */
  private async createAndAttachPolicy(
    userName: string, 
    s3Details: S3Details, 
    logger?: any
  ): Promise<void> {
    try {
      if (!userName) {
        throw new Error('Username is undefined or empty');
      }

      const policyName = 'SNS_S3_AutoGenerated_Policy';

      // Check if policy is already attached
      const listPoliciesCommand = new ListAttachedUserPoliciesCommand({
        UserName: userName
      });
      
      const attachedPolicies = await this.iamClient.send(listPoliciesCommand);
             const existingPolicy = attachedPolicies.AttachedPolicies?.find(
         (policy: any) => policy.PolicyName === policyName
       );

      if (existingPolicy) {
        if (logger) logger.info(`Policy ${policyName} already attached to user ${userName}`);
        return;
      }

      const policyDocument = {
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Action: [
              'sns:CreateTopic',
              'sns:Subscribe',
              'sns:Publish',
              'sns:SetTopicAttributes',
              'sns:GetTopicAttributes'
            ],
            Resource: 'arn:aws:sns:*:*:*'
          },
          {
            Effect: 'Allow',
            Action: ['s3:PutBucketNotification'],
            Resource: `arn:aws:s3:::${s3Details.bucketName}`
          }
        ]
      };

      const createPolicyCommand = new CreatePolicyCommand({
        PolicyName: policyName,
        PolicyDocument: JSON.stringify(policyDocument),
        Description: 'Policy to allow SNS and S3 notifications',
      });

      const policyResponse = await this.iamClient.send(createPolicyCommand);
      if (logger) logger.info(`Policy created: ${policyResponse.Policy?.Arn}`);

      const attachPolicyCommand = new AttachUserPolicyCommand({
        UserName: userName,
        PolicyArn: policyResponse.Policy?.Arn,
      });

      await this.iamClient.send(attachPolicyCommand);
      if (logger) logger.info(`Policy attached to user ${userName}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Error creating/attaching policy: ${errorMessage}`);
    }
  }

  /**
   * Get IAM username from AWS credentials
   */
  async getIamUserName(s3Details: S3Details): Promise<string> {
    try {
      const command = new GetCallerIdentityCommand({});
      const response = await this.stsClient.send(command);

      return response.Arn?.split('/').pop() || 'default-user';
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Error getting IAM username: ${errorMessage}`);
    }
  }

  /**
   * Get SNS subscription attributes
   */
  async getSNSSubscriptionAttributes(
    subscriptionArn: string, 
    s3Details: S3Details, 
    logger?: any
  ): Promise<any> {
    try {
      const command = new GetSubscriptionAttributesCommand({
        SubscriptionArn: subscriptionArn
      });

      const response = await this.snsClient.send(command);
      if (logger) logger.info('SNS subscription attributes fetched successfully');
      
      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Error getting SNS subscription attributes: ${errorMessage}`);
    }
  }

  /**
   * Get subscription ARN by endpoint
   */
  async getSubscriptionArnByEndpoint(
    topicArn: string, 
    s3Details: S3Details, 
    endpoint: string,
    logger?: any
  ): Promise<string | undefined> {
    try {
      const command = new ListSubscriptionsByTopicCommand({
        TopicArn: topicArn
      });

      const { Subscriptions } = await this.snsClient.send(command);
      const subscription = Subscriptions?.find((sub: any) =>
        sub.Endpoint === endpoint && sub.Protocol === 'https'
      );

      if (logger) logger.info('Subscription ARN endpoint fetched successfully');
      return subscription?.SubscriptionArn;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Error getting subscription ARN: ${errorMessage}`);
    }
  }

  /**
   * Generate custom filename with timestamp
   */
  private generateCustomFileName(originalName: string): string {
    const timestamp = Date.now();
    const extension = originalName.split('.').pop();
    const nameWithoutExt = originalName.replace(`.${extension}`, '');
    return `${nameWithoutExt}_${timestamp}.${extension}`;
  }

  /**
   * Generate public filename with prefix
   */
  private generatePublicFileName(originalName: string, prefix: string): string {
    const timestamp = Date.now();
    const extension = originalName.split('.').pop();
    const nameWithoutExt = originalName.replace(`.${extension}`, '');
    return `${prefix}/${nameWithoutExt}_${timestamp}.${extension}`;
  }
}

/**
 * Helper function to create S3 utils
 */
export function createS3Utils(options?: S3UtilsOptions): S3Utils {
  return new S3Utils(options);
}

/**
 * Common S3 utility functions
 */
export const S3Helpers = {
  /**
   * Generate a unique filename
   */
  generateUniqueFilename: (originalName: string, prefix?: string): string => {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    const extension = originalName.split('.').pop();
    const nameWithoutExt = originalName.replace(`.${extension}`, '');
    const filename = `${nameWithoutExt}_${timestamp}_${random}.${extension}`;
    return prefix ? `${prefix}/${filename}` : filename;
  },

  /**
   * Validate S3 bucket name
   */
  validateBucketName: (bucketName: string): boolean => {
    const bucketRegex = /^[a-z0-9][a-z0-9.-]*[a-z0-9]$/;
    return bucketRegex.test(bucketName) && bucketName.length >= 3 && bucketName.length <= 63;
  },

  /**
   * Get S3 object size in human readable format
   */
  formatFileSize: (bytes: number): string => {
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    if (bytes === 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  },
};
