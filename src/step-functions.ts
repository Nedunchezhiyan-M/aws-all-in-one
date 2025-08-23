import { SFNClient, StartExecutionCommand, DescribeExecutionCommand, ListExecutionsCommand, StopExecutionCommand } from '@aws-sdk/client-sfn';

export interface StepFunctionOptions {
  stateMachineArn: string;
  region?: string;
  sfnClient?: SFNClient;
}

export interface ExecutionInput {
  [key: string]: any;
}

export interface ExecutionResult {
  executionArn: string;
  startDate: Date;
  status: string;
  input?: string;
  output?: string;
  error?: string;
}

export interface ExecutionStatus {
  executionArn: string;
  stateMachineArn: string;
  name: string;
  status: 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'TIMED_OUT' | 'ABORTED';
  startDate: Date;
  stopDate?: Date;
  input?: string;
  output?: string;
  error?: string;
  cause?: string;
}

/**
 * Step Functions Helper
 * Modern wrapper for invoking and monitoring Step Functions from Node.js
 */
export class StepFunctionsHelper {
  private options: StepFunctionOptions;
  private sfnClient: SFNClient;

  constructor(options: StepFunctionOptions) {
    this.options = {
      region: 'us-east-1',
      ...options,
    };

    this.sfnClient = options.sfnClient || new SFNClient({ region: this.options.region });
  }

  /**
   * Start a new execution
   */
  async startExecution(
    name: string,
    input: ExecutionInput = {},
    options: {
      traceHeader?: string;
      maxRetries?: number;
      retryDelay?: number;
    } = {}
  ): Promise<ExecutionResult> {
    const { traceHeader, maxRetries = 3, retryDelay = 1000 } = options;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
                         const command = new StartExecutionCommand({
                   stateMachineArn: this.options.stateMachineArn,
                   name: name,
                   input: JSON.stringify(input),
                   traceHeader: traceHeader,
                 });

        const response = await this.sfnClient.send(command);

        if (!response.executionArn) {
          throw new Error('No execution ARN returned');
        }

        return {
          executionArn: response.executionArn,
          startDate: new Date(),
          status: 'RUNNING',
          input: JSON.stringify(input),
        };
      } catch (error) {
        if (attempt === maxRetries) {
          throw error;
        }
        
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }

    throw new Error('Failed to start execution after retries');
  }

  /**
   * Get execution status
   */
  async getExecutionStatus(executionArn: string): Promise<ExecutionStatus> {
                   const command = new DescribeExecutionCommand({
                 executionArn: executionArn,
               });

    const response = await this.sfnClient.send(command);

    if (!response.executionArn || !response.stateMachineArn || !response.name || !response.status) {
      throw new Error('Invalid execution response');
    }

    return {
      executionArn: response.executionArn,
      stateMachineArn: response.stateMachineArn,
      name: response.name,
      status: response.status as ExecutionStatus['status'],
      startDate: response.startDate!,
      stopDate: response.stopDate,
      input: response.input,
      output: response.output,
      error: response.error,
      cause: response.cause,
    };
  }

  /**
   * Wait for execution to complete
   */
  async waitForExecution(
    executionArn: string,
    options: {
      maxWaitTime?: number;
      pollInterval?: number;
      onStatusUpdate?: (status: ExecutionStatus) => void;
    } = {}
  ): Promise<ExecutionStatus> {
    const { maxWaitTime = 300000, pollInterval = 2000, onStatusUpdate } = options;
    const startTime = Date.now();

    while (true) {
      const status = await this.getExecutionStatus(executionArn);
      
      if (onStatusUpdate) {
        onStatusUpdate(status);
      }

      if (['SUCCEEDED', 'FAILED', 'TIMED_OUT', 'ABORTED'].includes(status.status)) {
        return status;
      }

      if (Date.now() - startTime > maxWaitTime) {
        throw new Error('Execution timeout exceeded');
      }

      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }
  }

  /**
   * List recent executions
   */
  async listExecutions(
    options: {
      maxResults?: number;
      statusFilter?: ExecutionStatus['status'];
    } = {}
  ): Promise<ExecutionStatus[]> {
    const { maxResults = 100, statusFilter } = options;

                   const command = new ListExecutionsCommand({
                 stateMachineArn: this.options.stateMachineArn,
                 maxResults: maxResults,
                 statusFilter: statusFilter,
               });

    const response = await this.sfnClient.send(command);
    const executions: ExecutionStatus[] = [];

    for (const execution of response.executions || []) {
      if (execution.executionArn && execution.stateMachineArn && execution.name && execution.status) {
                         executions.push({
                   executionArn: execution.executionArn,
                   stateMachineArn: execution.stateMachineArn,
                   name: execution.name,
                   status: execution.status as ExecutionStatus['status'],
                   startDate: execution.startDate!,
                   stopDate: execution.stopDate,
                   input: (execution as any).input,
                   output: (execution as any).output,
                   error: (execution as any).error,
                   cause: (execution as any).cause,
                 });
      }
    }

    return executions;
  }

  /**
   * Stop an execution
   */
  async stopExecution(
    executionArn: string,
    cause?: string
  ): Promise<boolean> {
    try {
                     const command = new StopExecutionCommand({
                 executionArn: executionArn,
                 cause: cause,
               });

      await this.sfnClient.send(command);
      return true;
    } catch (error) {
      // ✅ SAFE: Silent failure - no sensitive info exposure
      return false;
    }
  }

  /**
   * Execute and wait for completion
   */
  async executeAndWait(
    name: string,
    input: ExecutionInput = {},
    options: {
      traceHeader?: string;
      maxWaitTime?: number;
      pollInterval?: number;
      onStatusUpdate?: (status: ExecutionStatus) => void;
    } = {}
  ): Promise<ExecutionStatus> {
    const execution = await this.startExecution(name, input, options);
    return this.waitForExecution(execution.executionArn, options);
  }

  /**
   * Get execution output
   */
  async getExecutionOutput<T = any>(executionArn: string): Promise<T | null> {
    try {
      const status = await this.getExecutionStatus(executionArn);
      
      if (status.status === 'SUCCEEDED' && status.output) {
        return JSON.parse(status.output);
      }
      
      return null;
    } catch (error) {
      // ✅ SAFE: Silent failure - no sensitive info exposure
      return null;
    }
  }

  /**
   * Check if execution is running
   */
  async isExecutionRunning(executionArn: string): Promise<boolean> {
    try {
      const status = await this.getExecutionStatus(executionArn);
      return status.status === 'RUNNING';
    } catch {
      return false;
    }
  }
}

/**
 * Helper function to create Step Functions helper
 */
export function createStepFunctionsHelper(options: StepFunctionOptions): StepFunctionsHelper {
  return new StepFunctionsHelper(options);
}

/**
 * Common execution patterns
 */
export const ExecutionPatterns = {
  /**
   * Retry execution on failure
   */
  async retryOnFailure<T>(
    helper: StepFunctionsHelper,
    name: string,
    input: ExecutionInput,
    maxRetries: number = 3
  ): Promise<T> {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await helper.executeAndWait(name, input);
        
        if (result.status === 'SUCCEEDED' && result.output) {
          return JSON.parse(result.output);
        }
        
        if (result.status === 'FAILED') {
          throw new Error(result.error || 'Execution failed');
        }
      } catch (error) {
        if (attempt === maxRetries) {
          throw error;
        }
        
        // ✅ SAFE: Silent retry - no sensitive info exposure
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
      }
    }
    
    throw new Error('All execution attempts failed');
  },
};
