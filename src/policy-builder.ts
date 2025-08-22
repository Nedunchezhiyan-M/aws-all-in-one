export interface PolicyStatement {
  Effect: 'Allow' | 'Deny';
  Action: string | string[];
  Resource: string | string[];
  Condition?: Record<string, any>;
  Principal?: Record<string, any>;
  Sid?: string;
}

export interface PolicyDocument {
  Version: string;
  Statement: PolicyStatement[];
}

/**
 * IAM Policy Builder
 * Simplifies building least-privilege IAM policies programmatically
 */
export class PolicyBuilder {
  private statements: PolicyStatement[] = [];
  private version: string;

  constructor(version: string = '2012-10-17') {
    this.version = version;
  }

  /**
   * Add an allow statement
   */
  allow(actions: string | string[], resources: string | string[], sid?: string): this {
    this.statements.push({
      Effect: 'Allow',
      Action: actions,
      Resource: resources,
      Sid: sid,
    });
    return this;
  }

  /**
   * Add a deny statement
   */
  deny(actions: string | string[], resources: string | string[], sid?: string): this {
    this.statements.push({
      Effect: 'Deny',
      Action: actions,
      Resource: resources,
      Sid: sid,
    });
    return this;
  }

  /**
   * Add a statement with conditions
   */
  withCondition(
    effect: 'Allow' | 'Deny',
    actions: string | string[],
    resources: string | string[],
    condition: Record<string, any>,
    sid?: string
  ): this {
    this.statements.push({
      Effect: effect,
      Action: actions,
      Resource: resources,
      Condition: condition,
      Sid: sid,
    });
    return this;
  }

  /**
   * Build the final policy
   */
  build(): PolicyDocument {
    return {
      Version: this.version,
      Statement: this.statements,
    };
  }

  /**
   * Convert to JSON string
   */
  toJSON(): string {
    return JSON.stringify(this.build(), null, 2);
  }
}

/**
 * Common policy templates
 */
export const PolicyTemplates = {
  /**
   * S3 read-only access
   */
  s3ReadOnly(bucketName: string): PolicyBuilder {
    return new PolicyBuilder()
      .allow(['s3:GetObject', 's3:ListBucket'], [
        `arn:aws:s3:::${bucketName}`,
        `arn:aws:s3:::${bucketName}/*`
      ], 'S3ReadOnlyAccess');
  },

  /**
   * S3 read-write access
   */
  s3ReadWrite(bucketName: string): PolicyBuilder {
    return new PolicyBuilder()
      .allow(['s3:GetObject', 's3:PutObject', 's3:DeleteObject', 's3:ListBucket'], [
        `arn:aws:s3:::${bucketName}`,
        `arn:aws:s3:::${bucketName}/*`
      ], 'S3ReadWriteAccess');
  },

  /**
   * Lambda invoke access
   */
  lambdaInvoke(functionName: string): PolicyBuilder {
    return new PolicyBuilder()
      .allow('lambda:InvokeFunction', `arn:aws:lambda:*:*:function:${functionName}`, 'LambdaInvokeAccess');
  },

  /**
   * CloudWatch logs access
   */
  cloudWatchLogs(logGroupName: string): PolicyBuilder {
    return new PolicyBuilder()
      .allow(['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'], 
        `arn:aws:logs:*:*:log-group:${logGroupName}:*`, 'CloudWatchLogsAccess');
  },
};
