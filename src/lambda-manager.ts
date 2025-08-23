import { 
  LambdaClient, 
  CreateFunctionCommand,
  UpdateFunctionCodeCommand,
  UpdateFunctionConfigurationCommand,
  GetFunctionCommand,
  ListFunctionsCommand,
  DeleteFunctionCommand,
  InvokeCommand,
  CreateFunctionCommandInput,
  UpdateFunctionCodeCommandInput,
  UpdateFunctionConfigurationCommandInput,
  InvokeCommandInput
} from '@aws-sdk/client-lambda';
import { STSClient, GetCallerIdentityCommand } from '@aws-sdk/client-sts';

export interface LambdaFunctionConfig {
  functionName: string;
  runtime: 'nodejs18.x' | 'nodejs20.x' | 'python3.9' | 'python3.10' | 'python3.11';
  handler: string;
  role: string;
  code: Buffer;
  description?: string;
  timeout?: number;
  memorySize?: number;
  environment?: Record<string, string>;
  tags?: Record<string, string>;
}

export interface FunctionInfo {
  functionName: string;
  functionArn: string;
  runtime: string;
  handler: string;
  codeSize: number;
  description?: string;
  timeout: number;
  memorySize: number;
  lastModified: string;
  state: string;
}

export interface InvocationResult {
  statusCode: number;
  payload: string;
  logs?: string;
  error?: string;
}

export class LambdaManager {
  private lambdaClient: LambdaClient;
  private stsClient: STSClient;

  constructor(options?: { 
    lambdaClient?: LambdaClient; 
    stsClient?: STSClient;
  }) {
    this.lambdaClient = options?.lambdaClient || new LambdaClient({});
    this.stsClient = options?.stsClient || new STSClient({});
  }

  /**
   * Create a Lambda function with best practices
   */
  async createFunction(config: LambdaFunctionConfig): Promise<string> {
    const input: CreateFunctionCommandInput = {
      FunctionName: config.functionName,
      Runtime: config.runtime,
      Handler: config.handler,
      Role: config.role,
      Code: {
        ZipFile: config.code
      },
      Description: config.description,
      Timeout: config.timeout || 3,
      MemorySize: config.memorySize || 128,
      Environment: config.environment ? { Variables: config.environment } : undefined,
      Tags: config.tags
    };

    const command = new CreateFunctionCommand(input);
    const response = await this.lambdaClient.send(command);
    
    return response.FunctionArn || '';
  }

  /**
   * Update function code (deployment)
   */
  async updateFunctionCode(functionName: string, code: Buffer): Promise<void> {
    const input: UpdateFunctionCodeCommandInput = {
      FunctionName: functionName,
      ZipFile: code
    };

    const command = new UpdateFunctionCodeCommand(input);
    await this.lambdaClient.send(command);
  }

  /**
   * Update function configuration
   */
  async updateFunctionConfig(
    functionName: string, 
    updates: Partial<Pick<LambdaFunctionConfig, 'timeout' | 'memorySize' | 'environment' | 'description'>>
  ): Promise<void> {
    const input: UpdateFunctionConfigurationCommandInput = {
      FunctionName: functionName,
      Timeout: updates.timeout,
      MemorySize: updates.memorySize,
      Environment: updates.environment ? { Variables: updates.environment } : undefined,
      Description: updates.description
    };

    const command = new UpdateFunctionConfigurationCommand(input);
    await this.lambdaClient.send(command);
  }

  /**
   * Get function information
   */
  async getFunction(functionName: string): Promise<FunctionInfo | null> {
    try {
      const command = new GetFunctionCommand({ FunctionName: functionName });
      const response = await this.lambdaClient.send(command);
      
      if (!response.Configuration) return null;

      return {
        functionName: response.Configuration.FunctionName || '',
        functionArn: response.Configuration.FunctionArn || '',
        runtime: response.Configuration.Runtime || '',
        handler: response.Configuration.Handler || '',
        codeSize: response.Configuration.CodeSize || 0,
        description: response.Configuration.Description,
        timeout: response.Configuration.Timeout || 3,
        memorySize: response.Configuration.MemorySize || 128,
        lastModified: response.Configuration.LastModified || '',
        state: response.Configuration.State || ''
      };
    } catch (error) {
      if ((error as any).name === 'ResourceNotFoundException') {
        return null;
      }
      throw error;
    }
  }

  /**
   * List all functions with pagination
   */
  async listFunctions(): Promise<FunctionInfo[]> {
    const functions: FunctionInfo[] = [];
    let marker: string | undefined;

    do {
      const command = new ListFunctionsCommand({ Marker: marker });
      const response = await this.lambdaClient.send(command);
      
      if (response.Functions) {
        functions.push(...response.Functions.map(fn => ({
          functionName: fn.FunctionName || '',
          functionArn: fn.FunctionArn || '',
          runtime: fn.Runtime || '',
          handler: fn.Handler || '',
          codeSize: fn.CodeSize || 0,
          description: fn.Description,
          timeout: fn.Timeout || 3,
          memorySize: fn.MemorySize || 128,
          lastModified: fn.LastModified || '',
          state: fn.State || ''
        })));
      }
      
      marker = response.NextMarker;
    } while (marker);

    return functions;
  }

  /**
   * Invoke function with error handling
   */
  async invokeFunction(
    functionName: string, 
    payload: any, 
    options?: { 
      invocationType?: 'RequestResponse' | 'Event' | 'DryRun';
      logType?: 'None' | 'Tail';
    }
  ): Promise<InvocationResult> {
    const input: InvokeCommandInput = {
      FunctionName: functionName,
      Payload: Buffer.from(JSON.stringify(payload)),
      InvocationType: options?.invocationType || 'RequestResponse',
      LogType: options?.logType || 'None'
    };

    const command = new InvokeCommand(input);
    const response = await this.lambdaClient.send(command);

    return {
      statusCode: response.StatusCode || 200,
      payload: response.Payload ? Buffer.from(response.Payload).toString() : '',
      logs: response.LogResult ? Buffer.from(response.LogResult, 'base64').toString() : undefined,
      error: response.FunctionError
    };
  }

  /**
   * Delete function safely
   */
  async deleteFunction(functionName: string): Promise<void> {
    const command = new DeleteFunctionCommand({ FunctionName: functionName });
    await this.lambdaClient.send(command);
  }

  /**
   * Get current AWS account ID
   */
  async getCurrentAccountId(): Promise<string> {
    const command = new GetCallerIdentityCommand({});
    const response = await this.stsClient.send(command);
    return response.Account || '';
  }

  /**
   * Optimize function configuration for cost/performance
   */
  async optimizeFunction(functionName: string): Promise<{
    currentCost: number;
    optimizedCost: number;
    recommendations: string[];
  }> {
    const functionInfo = await this.getFunction(functionName);
    if (!functionInfo) {
      throw new Error(`Function ${functionName} not found`);
    }

    const currentCost = this.calculateCost(functionInfo.memorySize, functionInfo.timeout);
    const optimizedCost = this.calculateCost(128, 3); // Minimal config
    
    const recommendations: string[] = [];
    
    if (functionInfo.memorySize > 128) {
      recommendations.push(`Reduce memory from ${functionInfo.memorySize}MB to 128MB for cost savings`);
    }
    
    if (functionInfo.timeout > 3) {
      recommendations.push(`Reduce timeout from ${functionInfo.timeout}s to 3s if function completes faster`);
    }

    return {
      currentCost,
      optimizedCost,
      recommendations
    };
  }

  private calculateCost(memoryMB: number, timeoutSeconds: number): number {
    // Rough cost calculation (simplified)
    const memoryGB = memoryMB / 1024;
    const costPer100ms = (memoryGB * 0.0000166667) / 10; // $0.0000166667 per GB-second
    return costPer100ms * (timeoutSeconds * 10);
  }

  destroy(): void {
    this.lambdaClient.destroy();
    this.stsClient.destroy();
  }
}

export const lambdaManager = new LambdaManager();
