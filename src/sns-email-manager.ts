export interface SNSSubscriptionConfig {
  topicArn: string;
  emailAddresses: string[];
  protocol: 'email' | 'email-json';
  autoConfirm?: boolean;
}

export interface SubscriptionResult {
  email: string;
  subscriptionArn: string;
  status: 'pending' | 'confirmed' | 'failed';
  error?: string;
}

export class SNSEmailManager {
  
  // Subscribe multiple email addresses to an SNS topic
  static async subscribeEmails(
    config: SNSSubscriptionConfig,
    awsCredentials?: any
  ): Promise<SubscriptionResult[]> {
    
    const { SNSClient, SubscribeCommand } = require('@aws-sdk/client-sns');
    
    const snsClient = new SNSClient({
      region: awsCredentials?.region || process.env.AWS_REGION || 'us-east-1',
      credentials: awsCredentials ? {
        accessKeyId: awsCredentials.accessKeyId,
        secretAccessKey: awsCredentials.secretAccessKey,
        sessionToken: awsCredentials.sessionToken
      } : undefined
    });

    const results: SubscriptionResult[] = [];

    for (const email of config.emailAddresses) {
      try {
        const result = await snsClient.send(new SubscribeCommand({
          TopicArn: config.topicArn,
          Protocol: config.protocol,
          Endpoint: email
        }));

        results.push({
          email,
          subscriptionArn: result.SubscriptionArn!,
          status: 'pending'
        });

        console.log(`Subscribed ${email} to SNS topic`);
        console.log(`Check ${email} for confirmation link`);

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        results.push({
          email,
          subscriptionArn: '',
          status: 'failed',
          error: errorMessage
        });

        console.log(`Failed to subscribe ${email}: ${errorMessage}`);
      }
    }

    return results;
  }

  // Check subscription status
  static async checkSubscriptionStatus(
    subscriptionArn: string,
    awsCredentials?: any
  ): Promise<{ status: string; confirmed: boolean }> {
    
    const { SNSClient, GetSubscriptionAttributesCommand } = require('@aws-sdk/client-sns');
    
    const snsClient = new SNSClient({
      region: awsCredentials?.region || process.env.AWS_REGION || 'us-east-1',
      credentials: awsCredentials ? {
        accessKeyId: awsCredentials.accessKeyId,
        secretAccessKey: awsCredentials.secretAccessKey,
        sessionToken: awsCredentials.sessionToken
      } : undefined
    });

    try {
      const result = await snsClient.send(new GetSubscriptionAttributesCommand({
        SubscriptionArn: subscriptionArn
      }));

      const status = result.Attributes?.PendingConfirmation || 'false';
      const confirmed = status === 'false';

      return {
        status: confirmed ? 'confirmed' : 'pending',
        confirmed
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to check subscription status: ${errorMessage}`);
    }
  }

  // Resend confirmation email
  static async resendConfirmation(
    subscriptionArn: string,
    awsCredentials?: any
  ): Promise<void> {
    
    const { SNSClient, ConfirmSubscriptionCommand } = require('@aws-sdk/client-sns');
    
    const snsClient = new SNSClient({
      region: awsCredentials?.region || process.env.AWS_REGION || 'us-east-1',
      credentials: awsCredentials ? {
        accessKeyId: awsCredentials.accessKeyId,
        secretAccessKey: awsCredentials.secretAccessKey,
        sessionToken: awsCredentials.sessionToken
      } : undefined
    });

    try {
      // Note: AWS doesn't have a direct "resend confirmation" API
      // But we can check the status and provide guidance
      const status = await this.checkSubscriptionStatus(subscriptionArn, awsCredentials);
      
      if (status.confirmed) {
        console.log('Subscription is already confirmed');
      } else {
        console.log('Subscription is pending confirmation');
        console.log('Check your email for the confirmation link');
        console.log('If you didn\'t receive it, check your spam folder');
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to check subscription: ${errorMessage}`);
    }
  }

  // List all subscriptions for a topic
  static async listTopicSubscriptions(
    topicArn: string,
    awsCredentials?: any
  ): Promise<Array<{ email: string; status: string; subscriptionArn: string }>> {
    
    const { SNSClient, ListSubscriptionsByTopicCommand } = require('@aws-sdk/client-sns');
    
    const snsClient = new SNSClient({
      region: awsCredentials?.region || process.env.AWS_REGION || 'us-east-1',
      credentials: awsCredentials ? {
        accessKeyId: awsCredentials.accessKeyId,
        secretAccessKey: awsCredentials.secretAccessKey,
        sessionToken: awsCredentials.sessionToken
      } : undefined
    });

    try {
      const result = await snsClient.send(new ListSubscriptionsByTopicCommand({
        TopicArn: topicArn
      }));

      return result.Subscriptions
        ?.filter((sub: any) => sub.Protocol === 'email' || sub.Protocol === 'email-json')
        .map((sub: any) => ({
          email: sub.Endpoint!,
          status: sub.SubscriptionArn === 'PendingConfirmation' ? 'pending' : 'confirmed',
          subscriptionArn: sub.SubscriptionArn!
        })) || [];

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to list subscriptions: ${errorMessage}`);
    }
  }
}
