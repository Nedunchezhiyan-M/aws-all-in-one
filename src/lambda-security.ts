import { 
  IAMClient, 
  CreateRoleCommand,
  AttachRolePolicyCommand,
  PutRolePolicyCommand,
  GetRoleCommand,
  TagRoleCommand
} from '@aws-sdk/client-iam';
import { LambdaClient, GetFunctionCommand } from '@aws-sdk/client-lambda';

export interface SecurityPolicy {
  name: string;
  description: string;
  policy: string;
}

export interface SecurityReport {
  functionName: string;
  securityScore: number;
  findings: SecurityFinding[];
  recommendations: string[];
}

export interface SecurityFinding {
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  category: string;
  description: string;
  remediation: string;
}

export interface IAMRoleConfig {
  roleName: string;
  description?: string;
  policies: string[];
  customPolicy?: string;
  tags?: Record<string, string>;
}

export class LambdaSecurity {
  private iamClient: IAMClient;
  private lambdaClient: LambdaClient;

  constructor(options?: { 
    iamClient?: IAMClient; 
    lambdaClient?: LambdaClient;
  }) {
    this.iamClient = options?.iamClient || new IAMClient({});
    this.lambdaClient = options?.lambdaClient || new LambdaClient({});
  }

  /**
   * Generate least-privilege IAM role for Lambda
   */
  async generateLeastPrivilegeRole(config: IAMRoleConfig): Promise<string> {
    try {
      // Create role with Lambda trust policy
      const trustPolicy = {
        Version: '2012-10-17',
        Statement: [{
          Effect: 'Allow',
          Principal: { Service: 'lambda.amazonaws.com' },
          Action: 'sts:AssumeRole'
        }]
      };

      const createRoleCommand = new CreateRoleCommand({
        RoleName: config.roleName,
        Description: config.description || `Least-privilege role for ${config.roleName}`,
        AssumeRolePolicyDocument: JSON.stringify(trustPolicy),
        Tags: config.tags ? Object.entries(config.tags).map(([k, v]) => ({ Key: k, Value: v })) : undefined
      });

      const roleResponse = await this.iamClient.send(createRoleCommand);
      const roleArn = roleResponse.Role?.Arn;

      if (!roleArn) {
        throw new Error('Failed to create IAM role');
      }

      // Attach managed policies
      for (const policyArn of config.policies) {
        await this.iamClient.send(new AttachRolePolicyCommand({
          RoleName: config.roleName,
          PolicyArn: policyArn
        }));
      }

      // Attach custom policy if provided
      if (config.customPolicy) {
        await this.iamClient.send(new PutRolePolicyCommand({
          RoleName: config.roleName,
          PolicyName: `${config.roleName}-custom-policy`,
          PolicyDocument: config.customPolicy
        }));
      }

      return roleArn;
    } catch (error) {
      throw new Error(`Failed to create IAM role: ${(error as Error).message}`);
    }
  }

  /**
   * Security scan for Lambda function
   */
  async scanFunctionSecurity(functionName: string): Promise<SecurityReport> {
    const findings: SecurityFinding[] = [];
    const recommendations: string[] = [];
    let securityScore = 100;

    try {
      // Get function configuration
      const functionResponse = await this.lambdaClient.send(new GetFunctionCommand({
        FunctionName: functionName
      }));

      const config = functionResponse.Configuration;
      if (!config) {
        throw new Error('Function configuration not found');
      }

      // Check IAM role permissions
      if (config.Role) {
        const roleAnalysis = await this.analyzeRolePermissions(config.Role);
        findings.push(...roleAnalysis.findings);
        securityScore -= roleAnalysis.scoreDeduction;
      }

      // Check function configuration
      const configFindings = this.analyzeFunctionConfiguration(config);
      findings.push(...configFindings);
      securityScore -= configFindings.length * 5; // 5 points per finding

      // Check environment variables
      if (config.Environment?.Variables) {
        const envFindings = this.analyzeEnvironmentVariables(config.Environment.Variables);
        findings.push(...envFindings);
        securityScore -= envFindings.length * 10; // 10 points per env finding
      }

      // Generate recommendations
      recommendations.push(...this.generateSecurityRecommendations(findings));

      return {
        functionName,
        securityScore: Math.max(0, securityScore),
        findings,
        recommendations
      };
    } catch (error) {
      return {
        functionName,
        securityScore: 0,
        findings: [{
          severity: 'CRITICAL',
          category: 'SCAN_FAILURE',
          description: `Security scan failed: ${(error as Error).message}`,
          remediation: 'Check function permissions and try again'
        }],
        recommendations: ['Ensure function is accessible and permissions are correct']
      };
    }
  }

  /**
   * Analyze IAM role permissions
   */
  private async analyzeRolePermissions(roleArn: string): Promise<{
    findings: SecurityFinding[];
    scoreDeduction: number;
  }> {
    const findings: SecurityFinding[] = [];
    let scoreDeduction = 0;

    try {
      const roleName = roleArn.split('/').pop() || '';
      const roleResponse = await this.iamClient.send(new GetRoleCommand({ RoleName: roleName }));

      // Check for overly permissive policies
      if (roleResponse.Role?.Description?.toLowerCase().includes('admin')) {
        findings.push({
          severity: 'HIGH',
          category: 'IAM_PERMISSIONS',
          description: 'Role description suggests administrative privileges',
          remediation: 'Review and restrict role permissions to minimum required'
        });
        scoreDeduction += 20;
      }

      // Check for wildcard permissions
      // This is a simplified check - in production you'd analyze actual policy documents
      findings.push({
        severity: 'MEDIUM',
        category: 'IAM_PERMISSIONS',
        description: 'Role permissions should be reviewed for least privilege',
        remediation: 'Audit attached policies and remove unnecessary permissions'
      });
      scoreDeduction += 10;

    } catch (error) {
      findings.push({
        severity: 'MEDIUM',
        category: 'IAM_PERMISSIONS',
        description: 'Unable to analyze role permissions',
        remediation: 'Ensure role is accessible and permissions are correct'
      });
      scoreDeduction += 5;
    }

    return { findings, scoreDeduction };
  }

  /**
   * Analyze function configuration for security issues
   */
  private analyzeFunctionConfiguration(config: any): SecurityFinding[] {
    const findings: SecurityFinding[] = [];

    // Check timeout settings
    if (config.Timeout && config.Timeout > 300) {
      findings.push({
        severity: 'MEDIUM',
        category: 'FUNCTION_CONFIG',
        description: 'Function timeout is set to more than 5 minutes',
        remediation: 'Reduce timeout to prevent long-running executions'
      });
    }

    // Check memory settings
    if (config.MemorySize && config.MemorySize > 1024) {
      findings.push({
        severity: 'LOW',
        category: 'FUNCTION_CONFIG',
        description: 'Function memory allocation is high',
        remediation: 'Optimize memory usage or reduce allocation'
      });
    }

    // Check VPC configuration
    if (!config.VpcConfig) {
      findings.push({
        severity: 'LOW',
        category: 'NETWORK_SECURITY',
        description: 'Function is not configured with VPC',
        remediation: 'Consider VPC configuration for network isolation'
      });
    }

    return findings;
  }

  /**
   * Analyze environment variables for sensitive data
   */
  private analyzeEnvironmentVariables(variables: Record<string, string>): SecurityFinding[] {
    const findings: SecurityFinding[] = [];
    const sensitivePatterns = [
      /password/i,
      /secret/i,
      /key/i,
      /token/i,
      /credential/i
    ];

    for (const [key, value] of Object.entries(variables)) {
      // Check for sensitive key names
      if (sensitivePatterns.some(pattern => pattern.test(key))) {
        findings.push({
          severity: 'HIGH',
          category: 'ENVIRONMENT_VARIABLES',
          description: `Environment variable '${key}' may contain sensitive data`,
          remediation: 'Use AWS Secrets Manager or Parameter Store for sensitive values'
        });
      }

      // Check for hardcoded sensitive values
      if (value.length > 20 && /^[A-Za-z0-9+/=]+$/.test(value)) {
        findings.push({
          severity: 'MEDIUM',
          category: 'ENVIRONMENT_VARIABLES',
          description: `Environment variable '${key}' may contain encoded sensitive data`,
          remediation: 'Review and secure this environment variable'
        });
      }
    }

    return findings;
  }

  /**
   * Generate security recommendations
   */
  private generateSecurityRecommendations(findings: SecurityFinding[]): string[] {
    const recommendations: string[] = [];

    if (findings.some(f => f.severity === 'CRITICAL')) {
      recommendations.push('Address critical security findings immediately');
    }

    if (findings.some(f => f.category === 'IAM_PERMISSIONS')) {
      recommendations.push('Implement least-privilege IAM policies');
    }

    if (findings.some(f => f.category === 'ENVIRONMENT_VARIABLES')) {
      recommendations.push('Use AWS Secrets Manager for sensitive configuration');
    }

    if (findings.some(f => f.category === 'NETWORK_SECURITY')) {
      recommendations.push('Configure VPC for network isolation');
    }

    if (findings.length === 0) {
      recommendations.push('Function security configuration looks good');
    }

    return recommendations;
  }

  /**
   * Get predefined security policies
   */
  getSecurityPolicies(): SecurityPolicy[] {
    return [
      {
        name: 'lambda-basic-execution',
        description: 'Basic Lambda execution policy',
        policy: JSON.stringify({
          Version: '2012-10-17',
          Statement: [{
            Effect: 'Allow',
            Action: [
              'logs:CreateLogGroup',
              'logs:CreateLogStream',
              'logs:PutLogEvents'
            ],
            Resource: 'arn:aws:logs:*:*:*'
          }]
        })
      },
      {
        name: 'lambda-vpc-execution',
        description: 'Lambda VPC execution policy',
        policy: JSON.stringify({
          Version: '2012-10-17',
          Statement: [{
            Effect: 'Allow',
            Action: [
              'ec2:CreateNetworkInterface',
              'ec2:DescribeNetworkInterfaces',
              'ec2:DeleteNetworkInterface'
            ],
            Resource: '*'
          }]
        })
      }
    ];
  }

  destroy(): void {
    this.iamClient.destroy();
    this.lambdaClient.destroy();
  }
}

export const lambdaSecurity = new LambdaSecurity();
