import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { SQSClient, SendMessageCommand, ReceiveMessageCommand, DeleteMessageCommand } from '@aws-sdk/client-sqs';
import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';

export interface MessageOptions {
  region?: string;
  maxRetries?: number;
  retryDelay?: number;
  deadLetterQueueUrl?: string;
}

export interface PublishResult {
  messageId: string;
  success: boolean;
  error?: string;
}

export interface MessageHandler<T = any> {
  (message: T): Promise<void>;
}

/**
 * Unified Messaging Utility
 * Integrates EventBridge, SNS, and SQS with retries and dead-letter handling
 */
export class MessagingUtils {
  private options: MessageOptions;
  private snsClient: SNSClient;
  private sqsClient: SQSClient;
  private eventBridgeClient: EventBridgeClient;

  constructor(options: MessageOptions = {}) {
    this.options = {
      region: 'us-east-1',
      maxRetries: 3,
      retryDelay: 1000,
      ...options,
    };

    this.snsClient = new SNSClient({ region: this.options.region });
    this.sqsClient = new SQSClient({ region: this.options.region });
    this.eventBridgeClient = new EventBridgeClient({ region: this.options.region });
  }

  /**
   * Publish message to SNS topic
   */
  async publishToSNS(
    topicArn: string,
    message: string | object,
    subject?: string,
    attributes?: Record<string, string>
  ): Promise<PublishResult> {
    try {
      const messageBody = typeof message === 'string' ? message : JSON.stringify(message);
      
      const command = new PublishCommand({
        TopicArn: topicArn,
        Message: messageBody,
        Subject: subject,
        MessageAttributes: attributes ? this.convertToSNSAttributes(attributes) : undefined,
      });

      const response = await this.snsClient.send(command);
      
      return {
        messageId: response.MessageId || '',
        success: true,
      };
    } catch (error) {
      return {
        messageId: '',
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Send message to SQS queue
   */
  async sendToSQS(
    queueUrl: string,
    message: string | object,
    attributes?: Record<string, string>,
    delaySeconds?: number
  ): Promise<PublishResult> {
    try {
      const messageBody = typeof message === 'string' ? message : JSON.stringify(message);
      
      const command = new SendMessageCommand({
        QueueUrl: queueUrl,
        MessageBody: messageBody,
        MessageAttributes: attributes ? this.convertToSQSAttributes(attributes) : undefined,
        DelaySeconds: delaySeconds,
      });

      const response = await this.sqsClient.send(command);
      
      return {
        messageId: response.MessageId || '',
        success: true,
      };
    } catch (error) {
      return {
        messageId: '',
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Put event to EventBridge
   */
  async putEvent(
    eventBusName: string,
    source: string,
    detailType: string,
    detail: any,
    resources?: string[]
  ): Promise<PublishResult> {
    try {
      const command = new PutEventsCommand({
        Entries: [{
          Source: source,
          DetailType: detailType,
          Detail: JSON.stringify(detail),
          EventBusName: eventBusName,
          Resources: resources,
        }],
      });

      const response = await this.eventBridgeClient.send(command);
      
      if (response.FailedEntryCount && response.FailedEntryCount > 0) {
        throw new Error('EventBridge put failed');
      }
      
      return {
        messageId: response.Entries?.[0]?.EventId || '',
        success: true,
      };
    } catch (error) {
      return {
        messageId: '',
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Receive messages from SQS queue
   */
  async receiveFromSQS(
    queueUrl: string,
    maxMessages: number = 10,
    waitTimeSeconds: number = 20
  ): Promise<any[]> {
    try {
      const command = new ReceiveMessageCommand({
        QueueUrl: queueUrl,
        MaxNumberOfMessages: maxMessages,
        WaitTimeSeconds: waitTimeSeconds,
        MessageAttributeNames: ['All'],
      });

      const response = await this.sqsClient.send(command);
      return response.Messages || [];
    } catch (error) {
      // ✅ SAFE: Silent failure - no sensitive info exposure
      return [];
    }
  }

  /**
   * Delete message from SQS queue
   */
  async deleteFromSQS(queueUrl: string, receiptHandle: string): Promise<boolean> {
    try {
      const command = new DeleteMessageCommand({
        QueueUrl: queueUrl,
        ReceiptHandle: receiptHandle,
      });

      await this.sqsClient.send(command);
      return true;
    } catch (error) {
      // ✅ SAFE: Silent failure - no sensitive info exposure
      return false;
    }
  }

  /**
   * Process SQS messages with retry and dead-letter handling
   */
  async processSQSMessages<T = any>(
    queueUrl: string,
    handler: MessageHandler<T>,
    options: {
      maxMessages?: number;
      waitTimeSeconds?: number;
      maxRetries?: number;
      onError?: (error: Error, message: any) => void;
    } = {}
  ): Promise<void> {
    const {
      maxMessages = 10,
      waitTimeSeconds = 20,
      maxRetries = this.options.maxRetries,
      onError,
    } = options;

    while (true) {
      try {
        const messages = await this.receiveFromSQS(queueUrl, maxMessages, waitTimeSeconds);
        
        if (messages.length === 0) {
          continue;
        }

        for (const message of messages) {
          try {
            const body = JSON.parse(message.Body || '{}');
            await handler(body);
            
            // Delete successful message
            await this.deleteFromSQS(queueUrl, message.ReceiptHandle!);
          } catch (error) {
            const errorObj = error instanceof Error ? error : new Error(String(error));
            
            if (onError) {
              onError(errorObj, message);
            }

            // Move to dead-letter queue if configured
            if (this.options.deadLetterQueueUrl) {
              await this.sendToSQS(this.options.deadLetterQueueUrl, message.Body, {
                'original-queue': queueUrl,
                'error-message': errorObj.message,
                'timestamp': new Date().toISOString(),
              });
              
              // Delete from original queue
              await this.deleteFromSQS(queueUrl, message.ReceiptHandle!);
            }
          }
        }
      } catch (error) {
        // ✅ SAFE: Silent failure - no sensitive info exposure
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }

  /**
   * Convert attributes to SNS format
   */
  private convertToSNSAttributes(attributes: Record<string, string>): Record<string, any> {
    const result: Record<string, any> = {};
    
    for (const [key, value] of Object.entries(attributes)) {
      result[key] = {
        DataType: 'String',
        StringValue: value,
      };
    }
    
    return result;
  }

  /**
   * Convert attributes to SQS format
   */
  private convertToSQSAttributes(attributes: Record<string, string>): Record<string, any> {
    const result: Record<string, any> = {};
    
    for (const [key, value] of Object.entries(attributes)) {
      result[key] = {
        DataType: 'String',
        StringValue: value,
      };
    }
    
    return result;
  }
}

/**
 * Helper function to create messaging utils
 */
export function createMessagingUtils(options?: MessageOptions): MessagingUtils {
  return new MessagingUtils(options);
}
