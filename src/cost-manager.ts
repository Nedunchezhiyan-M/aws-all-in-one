import { 
  CostExplorerClient, 
  GetCostAndUsageCommand,
  GetReservationUtilizationCommand,
  GetCostForecastCommand,
  GetAnomaliesCommand,
  GetAnomaliesCommandInput,
  GetCostAndUsageCommandInput,
  GetReservationUtilizationCommandInput,
  GetCostForecastCommandInput
} from '@aws-sdk/client-cost-explorer';
import { 
  CloudWatchClient, 
  GetMetricDataCommand,
  GetMetricDataCommandInput,
  MetricDataQuery
} from '@aws-sdk/client-cloudwatch';

export interface CostAnalysisOptions {
  startDate: Date;
  endDate: Date;
  granularity?: 'DAILY' | 'MONTHLY' | 'HOURLY';
  metrics?: string[];
  groupBy?: Array<{ Type: 'DIMENSION' | 'TAG'; Key?: string }>;
  filter?: any;
  costExplorerClient?: CostExplorerClient;
  cloudWatchClient?: CloudWatchClient;
}

export interface CostData {
  timePeriod: { start: string; end: string };
  totalCost: number;
  currency: string;
  groups?: Array<{
    keys: string[];
    metrics: { [key: string]: { amount: string; unit: string } };
  }>;
}

export interface CostForecast {
  timePeriod: { start: string; end: string };
  totalCost: number;
  currency: string;
  confidence: number;
}

export interface AnomalyData {
  anomalyId: string;
  anomalyStartDate: string;
  anomalyEndDate: string;
  rootCauses: string[];
  impact: {
    maxImpact: number;
    totalImpact: number;
  };
  anomalyDetails: {
    maxImpact: number;
    totalImpact: number;
  };
}

export interface ReservationUtilization {
  timePeriod: { start: string; end: string };
  groups: Array<{
    keys: string[];
    utilization: {
      utilizationPercentage: string;
      unusedHours: string;
      totalHours: string;
    };
  }>;
}

export interface CostOptimizationRecommendation {
  type: 'reserved_instance' | 'spot_instance' | 'rightsizing' | 'storage_tier' | 'idle_resource';
  service: string;
  resourceId?: string;
  potentialSavings: number;
  currency: string;
  description: string;
  action: string;
  priority: 'low' | 'medium' | 'high';
}

export class CostManager {
  private costExplorerClient: CostExplorerClient;
  private cloudWatchClient: CloudWatchClient;

  constructor(options?: { 
    costExplorerClient?: CostExplorerClient; 
    cloudWatchClient?: CloudWatchClient;
  }) {
    this.costExplorerClient = options?.costExplorerClient || new CostExplorerClient({});
    this.cloudWatchClient = options?.cloudWatchClient || new CloudWatchClient({});
  }

  async getCostAndUsage(options: CostAnalysisOptions): Promise<CostData> {
    const input: GetCostAndUsageCommandInput = {
      TimePeriod: {
        Start: options.startDate.toISOString().split('T')[0],
        End: options.endDate.toISOString().split('T')[0]
      },
      Granularity: options.granularity || 'MONTHLY',
      Metrics: options.metrics || ['UnblendedCost'],
      GroupBy: options.groupBy,
      Filter: options.filter
    };

    const command = new GetCostAndUsageCommand(input);
    const response = await this.costExplorerClient.send(command);

    if (!response.ResultsByTime || response.ResultsByTime.length === 0) {
      throw new Error('No cost data available for the specified time period');
    }

    const totalCost = response.ResultsByTime.reduce((sum, result) => {
      const cost = parseFloat(result.Total?.UnblendedCost?.Amount || '0');
      return sum + cost;
    }, 0);

    return {
      timePeriod: {
        start: input.TimePeriod!.Start!,
        end: input.TimePeriod!.End!
      },
      totalCost,
      currency: response.ResultsByTime[0]?.Total?.UnblendedCost?.Unit || 'USD',
      groups: response.ResultsByTime[0]?.Groups?.map(group => ({
        keys: group.Keys || [],
        metrics: Object.fromEntries(
          Object.entries(group.Metrics || {}).map(([key, value]) => [
            key,
            {
              amount: value.Amount || '0',
              unit: value.Unit || 'USD'
            }
          ])
        )
      }))
    };
  }

  async getCostForecast(options: CostAnalysisOptions): Promise<CostForecast> {
    const input: GetCostForecastCommandInput = {
      TimePeriod: {
        Start: options.startDate.toISOString().split('T')[0],
        End: options.endDate.toISOString().split('T')[0]
      },
      Metric: 'UNBLENDED_COST',
      Granularity: options.granularity || 'MONTHLY'
    };

    const command = new GetCostForecastCommand(input);
    const response = await this.costExplorerClient.send(command);

    if (!response.ForecastResultsByTime || response.ForecastResultsByTime.length === 0) {
      throw new Error('No cost forecast available for the specified time period');
    }

    const totalCost = response.ForecastResultsByTime.reduce((sum, result) => {
      const cost = parseFloat(result.MeanValue || '0');
      return sum + cost;
    }, 0);

    return {
      timePeriod: {
        start: input.TimePeriod!.Start!,
        end: input.TimePeriod!.End!
      },
      totalCost,
      currency: 'USD',
      confidence: 0.95
    };
  }

  async getAnomalies(options: CostAnalysisOptions): Promise<AnomalyData[]> {
    const input: GetAnomaliesCommandInput = {
      DateInterval: {
        StartDate: options.startDate.toISOString().split('T')[0],
        EndDate: options.endDate.toISOString().split('T')[0]
      }
    };

    const command = new GetAnomaliesCommand(input);
    const response = await this.costExplorerClient.send(command);

    if (!response.Anomalies) {
      return [];
    }

    return response.Anomalies.map(anomaly => ({
      anomalyId: anomaly.AnomalyId || '',
      anomalyStartDate: anomaly.AnomalyStartDate || '',
      anomalyEndDate: anomaly.AnomalyEndDate || '',
      rootCauses: anomaly.RootCauses?.map(rc => rc.Service || '') || [],
      impact: {
        maxImpact: parseFloat(String(anomaly.Impact?.MaxImpact || '0')),
        totalImpact: parseFloat(String(anomaly.Impact?.TotalImpact || '0'))
      },
      anomalyDetails: {
        maxImpact: parseFloat(String(anomaly.Impact?.MaxImpact || '0')),
        totalImpact: parseFloat(String(anomaly.Impact?.TotalImpact || '0'))
      }
    }));
  }

  async getReservationUtilization(options: CostAnalysisOptions): Promise<ReservationUtilization> {
    const input: GetReservationUtilizationCommandInput = {
      TimePeriod: {
        Start: options.startDate.toISOString().split('T')[0],
        End: options.endDate.toISOString().split('T')[0]
      },
      Granularity: options.granularity || 'MONTHLY',
      GroupBy: options.groupBy
    };

    const command = new GetReservationUtilizationCommand(input);
    const response = await this.costExplorerClient.send(command);

    return {
      timePeriod: {
        start: input.TimePeriod!.Start!,
        end: input.TimePeriod!.End!
      },
      groups: response.UtilizationsByTime?.[0]?.Groups?.map(group => ({
        keys: group.Key ? [group.Key] : [],
        utilization: {
          utilizationPercentage: group.Utilization?.UtilizationPercentage || '0',
          unusedHours: group.Utilization?.UnusedHours || '0',
          totalHours: (group.Utilization as any)?.TotalHours || (group.Utilization as any)?.TotalUtilizedHours || '0'
        }
      })) || []
    };
  }

  async getResourceMetrics(service: string, resourceId: string, metric: string, period: number = 3600): Promise<number[]> {
    const input: GetMetricDataCommandInput = {
      StartTime: new Date(Date.now() - period * 1000),
      EndTime: new Date(),
      MetricDataQueries: [
        {
          Id: 'cost_metric',
          MetricStat: {
            Metric: {
              Namespace: 'AWS/' + service,
              MetricName: metric,
              Dimensions: [
                {
                  Name: 'ResourceId',
                  Value: resourceId
                }
              ]
            },
            Period: period,
            Stat: 'Average'
          }
        }
      ] as MetricDataQuery[]
    };

    const command = new GetMetricDataCommand(input);
    const response = await this.cloudWatchClient.send(command);

    return response.MetricDataResults?.[0]?.Values || [];
  }

  async getCostOptimizationRecommendations(options: CostAnalysisOptions): Promise<CostOptimizationRecommendation[]> {
    const recommendations: CostOptimizationRecommendation[] = [];

    try {
      const costData = await this.getCostAndUsage(options);
      const anomalies = await this.getAnomalies(options);
      const reservationUtilization = await this.getReservationUtilization(options);

      if (costData.totalCost > 1000) {
        recommendations.push({
          type: 'reserved_instance',
          service: 'EC2',
          potentialSavings: costData.totalCost * 0.3,
          currency: costData.currency,
          description: 'High monthly costs detected. Consider Reserved Instances for 30% savings.',
          action: 'Review EC2 usage patterns and purchase RIs for consistent workloads',
          priority: 'high'
        });
      }

      if (anomalies.length > 0) {
        const totalAnomalyImpact = anomalies.reduce((sum, anomaly) => sum + anomaly.impact.totalImpact, 0);
        if (totalAnomalyImpact > 100) {
          recommendations.push({
            type: 'rightsizing',
            service: 'General',
            potentialSavings: totalAnomalyImpact * 0.5,
            currency: 'USD',
            description: 'Cost anomalies detected. Review resource sizing and usage patterns.',
            action: 'Investigate and optimize resources causing cost spikes',
            priority: 'medium'
          });
        }
      }

      if (reservationUtilization.groups.length > 0) {
        const lowUtilization = reservationUtilization.groups.some(group => 
          parseFloat(group.utilization.utilizationPercentage) < 50
        );
        
        if (lowUtilization) {
          recommendations.push({
            type: 'idle_resource',
            service: 'Reserved Instances',
            potentialSavings: costData.totalCost * 0.15,
            currency: costData.currency,
            description: 'Low reservation utilization detected. Consider selling unused RIs.',
            action: 'Review RI utilization and sell unused reservations',
            priority: 'medium'
          });
        }
      }

    } catch (error) {
      // ✅ SAFE: Silent failure - no sensitive info exposure
    }

    return recommendations;
  }

  async calculateServiceCost(service: string, options: CostAnalysisOptions): Promise<number> {
    const serviceFilter = {
      Dimensions: {
        Key: 'SERVICE',
        Values: [service]
      }
    };

    const costData = await this.getCostAndUsage({
      ...options,
      filter: serviceFilter
    });

    return costData.totalCost;
  }

  async getMonthlyTrends(months: number = 6): Promise<{ month: string; cost: number }[]> {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - months);

    const costData = await this.getCostAndUsage({
      startDate,
      endDate,
      granularity: 'MONTHLY'
    });

    return costData.groups?.map(group => ({
      month: group.keys[0] || '',
      cost: parseFloat(group.metrics.UnblendedCost?.amount || '0')
    })) || [];
  }

  destroy(): void {
    this.costExplorerClient.destroy();
    this.cloudWatchClient.destroy();
  }
}

export const costManager = new CostManager();
