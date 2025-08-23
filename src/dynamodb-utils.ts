import {
  DynamoDBClient,
  PutItemCommand,
  GetItemCommand,
  UpdateItemCommand,
  DeleteItemCommand,
  QueryCommand,
  ScanCommand,
  BatchWriteItemCommand,
  BatchGetItemCommand,
  UpdateTableCommand,
  DescribeTableCommand,
  ListTablesCommand,
  CreateTableCommand,
  DeleteTableCommand,
  PutItemCommandInput,
  GetItemCommandInput,
  UpdateItemCommandInput,
  DeleteItemCommandInput,
  QueryCommandInput,
  ScanCommandInput,
  BatchWriteItemCommandInput,
  BatchGetItemCommandInput,
  UpdateTableCommandInput,
  CreateTableCommandInput,
  DeleteTableCommandInput
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';

export interface DynamoDBOptions {
  tableName: string;
  region?: string;
  dynamoDBClient?: DynamoDBClient;
}

export interface BatchOperationOptions {
  maxBatchSize?: number;
  delayBetweenBatches?: number;
  retryAttempts?: number;
}

export interface QueryOptions {
  indexName?: string;
  consistentRead?: boolean;
  scanIndexForward?: boolean;
  limit?: number;
  exclusiveStartKey?: Record<string, any>;
}

export interface ScanOptions {
  indexName?: string;
  consistentRead?: boolean;
  limit?: number;
  exclusiveStartKey?: Record<string, any>;
  segment?: number;
  totalSegments?: number;
}

export interface CostOptimizedQueryOptions extends QueryOptions {
  maxCost?: number;
  useGSI?: boolean;
  preferConsistentRead?: boolean;
}

export interface TableMetrics {
  itemCount: number;
  tableSizeBytes: number;
  readCapacityUnits: number;
  writeCapacityUnits: number;
  lastUpdateTime: Date;
}

export interface CostAnalysis {
  readRequestUnits: number;
  writeRequestUnits: number;
  storageCost: number;
  estimatedMonthlyCost: number;
}

export class DynamoDBUtils {
  private client: DynamoDBClient;
  private tableName: string;

  constructor(options: DynamoDBOptions) {
    this.client = options.dynamoDBClient || new DynamoDBClient({ region: options.region });
    this.tableName = options.tableName;
  }

  async putItem(item: Record<string, any>, options?: Partial<PutItemCommandInput>): Promise<void> {
    const input: PutItemCommandInput = {
      TableName: this.tableName,
      Item: marshall(item),
      ...options
    };

    const command = new PutItemCommand(input);
    await this.client.send(command);
  }

  async getItem(key: Record<string, any>, options?: Partial<GetItemCommandInput>): Promise<Record<string, any> | null> {
    const input: GetItemCommandInput = {
      TableName: this.tableName,
      Key: marshall(key),
      ...options
    };

    const command = new GetItemCommand(input);
    const response = await this.client.send(command);

    return response.Item ? unmarshall(response.Item) : null;
  }

  async updateItem(key: Record<string, any>, updates: Record<string, any>, options?: Partial<UpdateItemCommandInput>): Promise<void> {
    const updateExpression = this.buildUpdateExpression(updates);
    
    const input: UpdateItemCommandInput = {
      TableName: this.tableName,
      Key: marshall(key),
      UpdateExpression: updateExpression.expression,
      ExpressionAttributeNames: updateExpression.names,
      ExpressionAttributeValues: updateExpression.values,
      ...options
    };

    const command = new UpdateItemCommand(input);
    await this.client.send(command);
  }

  async deleteItem(key: Record<string, any>, options?: Partial<DeleteItemCommandInput>): Promise<void> {
    const input: DeleteItemCommandInput = {
      TableName: this.tableName,
      Key: marshall(key),
      ...options
    };

    const command = new DeleteItemCommand(input);
    await this.client.send(command);
  }

  async query(keyConditionExpression: string, expressionAttributeValues: Record<string, any>, options?: CostOptimizedQueryOptions): Promise<Record<string, any>[]> {
    const input: QueryCommandInput = {
      TableName: this.tableName,
      KeyConditionExpression: keyConditionExpression,
      ExpressionAttributeValues: marshall(expressionAttributeValues),
      IndexName: options?.indexName,
      ConsistentRead: options?.preferConsistentRead ? true : false,
      ScanIndexForward: options?.scanIndexForward,
      Limit: options?.limit,
      ExclusiveStartKey: options?.exclusiveStartKey ? marshall(options.exclusiveStartKey) : undefined,
      ...options
    };

    const command = new QueryCommand(input);
    const response = await this.client.send(command);

    return response.Items ? response.Items.map(item => unmarshall(item)) : [];
  }

  async scan(filterExpression?: string, expressionAttributeValues?: Record<string, any>, options?: ScanOptions): Promise<Record<string, any>[]> {
    const input: ScanCommandInput = {
      TableName: this.tableName,
      FilterExpression: filterExpression,
      ExpressionAttributeValues: expressionAttributeValues ? marshall(expressionAttributeValues) : undefined,
      IndexName: options?.indexName,
      ConsistentRead: options?.consistentRead,
      Limit: options?.limit,
      ExclusiveStartKey: options?.exclusiveStartKey ? marshall(options.exclusiveStartKey) : undefined,
      Segment: options?.segment,
      TotalSegments: options?.totalSegments,
      ...options
    };

    const command = new ScanCommand(input);
    const response = await this.client.send(command);

    return response.Items ? response.Items.map(item => unmarshall(item)) : [];
  }

  async batchWrite(items: Array<{ put?: Record<string, any>; delete?: Record<string, any> }>, options?: BatchOperationOptions): Promise<void> {
    const maxBatchSize = options?.maxBatchSize || 25;
    const delayBetweenBatches = options?.delayBetweenBatches || 100;
    const retryAttempts = options?.retryAttempts || 3;

    for (let i = 0; i < items.length; i += maxBatchSize) {
      const batch = items.slice(i, i + maxBatchSize);
      const batchInput: BatchWriteItemCommandInput = {
        RequestItems: {
          [this.tableName]: batch.map(item => {
            if (item.put) {
              return { PutRequest: { Item: marshall(item.put) } };
            } else if (item.delete) {
              return { DeleteRequest: { Key: marshall(item.delete) } };
            }
            throw new Error('Each item must have either put or delete property');
          })
        }
      };

      let attempts = 0;
      while (attempts < retryAttempts) {
        try {
          const command = new BatchWriteItemCommand(batchInput);
          const response = await this.client.send(command);

          if (response.UnprocessedItems && Object.keys(response.UnprocessedItems).length > 0) {
            if (attempts === retryAttempts - 1) {
              throw new Error('Some items could not be processed after all retry attempts');
            }
            await this.delay(delayBetweenBatches);
            attempts++;
          } else {
            break;
          }
        } catch (error) {
          if (attempts === retryAttempts - 1) {
            throw error;
          }
          await this.delay(delayBetweenBatches);
          attempts++;
        }
      }

      if (i + maxBatchSize < items.length) {
        await this.delay(delayBetweenBatches);
      }
    }
  }

  async batchGet(keys: Record<string, any>[], options?: Partial<BatchGetItemCommandInput>): Promise<Record<string, any>[]> {
    const maxBatchSize = 100;
    const results: Record<string, any>[] = [];

    for (let i = 0; i < keys.length; i += maxBatchSize) {
      const batchKeys = keys.slice(i, i + maxBatchSize);
      const input: BatchGetItemCommandInput = {
        RequestItems: {
          [this.tableName]: {
            Keys: batchKeys.map(key => marshall(key))
          }
        },
        ...options
      };

      const command = new BatchGetItemCommand(input);
      const response = await this.client.send(command);

      if (response.Responses && response.Responses[this.tableName]) {
        const batchResults = response.Responses[this.tableName].map(item => unmarshall(item));
        results.push(...batchResults);
      }
    }

    return results;
  }

  async createTable(tableDefinition: CreateTableCommandInput): Promise<void> {
    const command = new CreateTableCommand(tableDefinition);
    await this.client.send(command);
  }

  async deleteTable(): Promise<void> {
    const input: DeleteTableCommandInput = {
      TableName: this.tableName
    };

    const command = new DeleteTableCommand(input);
    await this.client.send(command);
  }

  async updateTableCapacity(readCapacityUnits: number, writeCapacityUnits: number): Promise<void> {
    const input: UpdateTableCommandInput = {
      TableName: this.tableName,
      ProvisionedThroughput: {
        ReadCapacityUnits: readCapacityUnits,
        WriteCapacityUnits: writeCapacityUnits
      }
    };

    const command = new UpdateTableCommand(input);
    await this.client.send(command);
  }

  async describeTable(): Promise<TableMetrics> {
    const input = {
      TableName: this.tableName
    };

    const command = new DescribeTableCommand(input);
    const response = await this.client.send(command);

    if (!response.Table) {
      throw new Error('Table not found');
    }

    return {
      itemCount: response.Table.ItemCount || 0,
      tableSizeBytes: response.Table.TableSizeBytes || 0,
      readCapacityUnits: response.Table.ProvisionedThroughput?.ReadCapacityUnits || 0,
      writeCapacityUnits: response.Table.ProvisionedThroughput?.WriteCapacityUnits || 0,
      lastUpdateTime: response.Table.CreationDateTime || new Date()
    };
  }

  async listTables(): Promise<string[]> {
    const command = new ListTablesCommand({});
    const response = await this.client.send(command);

    return response.TableNames || [];
  }

  async estimateQueryCost(keyConditionExpression: string, expressionAttributeValues: Record<string, any>): Promise<number> {
    const startTime = Date.now();
    const result = await this.query(keyConditionExpression, expressionAttributeValues, { limit: 1 });
    const endTime = Date.now();

    const readCapacityUnits = Math.ceil((endTime - startTime) / 100);
    return readCapacityUnits * 0.0001;
  }

  async getCostAnalysis(): Promise<CostAnalysis> {
    const metrics = await this.describeTable();
    
    const readRequestUnits = metrics.readCapacityUnits * 24 * 30;
    const writeRequestUnits = metrics.writeCapacityUnits * 24 * 30;
    const storageCost = (metrics.tableSizeBytes / (1024 * 1024 * 1024)) * 0.25;
    
    const estimatedMonthlyCost = (readRequestUnits * 0.0001) + (writeRequestUnits * 0.0001) + storageCost;

    return {
      readRequestUnits,
      writeRequestUnits,
      storageCost,
      estimatedMonthlyCost
    };
  }

  async optimizeQueryPerformance(keyConditionExpression: string, expressionAttributeValues: Record<string, any>): Promise<{
    optimizedExpression: string;
    estimatedCost: number;
    recommendations: string[];
  }> {
    const recommendations: string[] = [];
    let optimizedExpression = keyConditionExpression;

    if (keyConditionExpression.includes('begins_with')) {
      recommendations.push('Consider using a GSI for begins_with queries to improve performance');
    }

    if (keyConditionExpression.includes('between')) {
      recommendations.push('Range queries benefit from proper sort key design');
    }

    const estimatedCost = await this.estimateQueryCost(keyConditionExpression, expressionAttributeValues);

    if (estimatedCost > 0.01) {
      recommendations.push('High query cost detected. Consider adding a GSI or optimizing the key structure');
    }

    return {
      optimizedExpression,
      estimatedCost,
      recommendations
    };
  }

  private buildUpdateExpression(updates: Record<string, any>): {
    expression: string;
    names: Record<string, string>;
    values: Record<string, any>;
  } {
    const names: Record<string, string> = {};
    const values: Record<string, any> = {};
    const expressions: string[] = [];

    Object.entries(updates).forEach(([key, value]) => {
      const nameKey = `#${key}`;
      const valueKey = `:${key}`;
      
      names[nameKey] = key;
      values[valueKey] = value;
      expressions.push(`${nameKey} = ${valueKey}`);
    });

    return {
      expression: `SET ${expressions.join(', ')}`,
      names,
      values: marshall(values)
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  destroy(): void {
    this.client.destroy();
  }
}

export const createDynamoDBUtils = (options: DynamoDBOptions) => new DynamoDBUtils(options);
