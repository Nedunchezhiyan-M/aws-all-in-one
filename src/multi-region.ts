import { STSClient } from '@aws-sdk/client-sts';

export interface RegionConfig {
  region: string;
  priority?: number;
  credentials?: {
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken?: string;
  };
}

export interface MultiRegionConfig {
  regions: RegionConfig[];
  defaultRegion?: string;
  enableFailover?: boolean;
  maxRetries?: number;
  retryDelay?: number;
}

export interface MultiRegionClient<T> {
  client: T;
  region: string;
  priority: number;
}

/**
 * Multi-Region AWS Client Manager
 * Provides automatic failover and region management for AWS services
 */
export class MultiRegionManager {
  private config: MultiRegionConfig;
  private clients: Map<string, any> = new Map();

  constructor(config: MultiRegionConfig) {
    this.config = {
      enableFailover: true,
      maxRetries: 3,
      retryDelay: 1000,
      ...config,
    };
    
    // Sort regions by priority (lower number = higher priority)
    this.config.regions.sort((a, b) => (a.priority || 999) - (b.priority || 999));
  }

  /**
   * Get a client for a specific region
   */
  getClient<T>(region: string): T | undefined {
    return this.clients.get(region) as T;
  }

  /**
   * Get the highest priority client
   */
  getPrimaryClient<T>(): T | undefined {
    const primaryRegion = this.config.regions[0];
    if (!primaryRegion) return undefined;
    
    return this.getClient<T>(primaryRegion.region);
  }

  /**
   * Get all clients sorted by priority
   */
  getAllClients<T>(): MultiRegionClient<T>[] {
    return this.config.regions
      .map(region => ({
        client: this.getClient<T>(region.region),
        region: region.region,
        priority: region.priority || 999,
      }))
      .filter((item): item is MultiRegionClient<T> => item.client !== undefined)
      .sort((a, b) => a.priority - b.priority);
  }

  /**
   * Execute an operation with automatic failover
   */
  async executeWithFailover<T, R>(
    operation: (client: T) => Promise<R>,
    options: { 
      maxRetries?: number; 
      retryDelay?: number;
      onFailover?: (fromRegion: string, toRegion: string, error: Error) => void;
    } = {}
  ): Promise<R> {
    const maxRetries = options.maxRetries ?? this.config.maxRetries!;
    const retryDelay = options.retryDelay ?? this.config.retryDelay!;
    
    let lastError: Error;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const clients = this.getAllClients<T>();
      
      if (clients.length === 0) {
        throw new Error('No available clients in any region');
      }
      
      const client = clients[attempt % clients.length];
      
      try {
        return await operation(client.client);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        if (attempt < maxRetries) {
          const nextClient = clients[(attempt + 1) % clients.length];
          
          if (options.onFailover) {
            options.onFailover(client.region, nextClient.region, lastError);
          }
          
          // Wait before retrying
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
      }
    }
    
    throw lastError!;
  }

  /**
   * Health check for all regions
   */
  async healthCheck<T>(
    healthCheckOperation: (client: T) => Promise<boolean>
  ): Promise<Map<string, boolean>> {
    const results = new Map<string, boolean>();
    
    for (const region of this.config.regions) {
      const client = this.getClient<T>(region.region);
      if (client) {
        try {
          const isHealthy = await healthCheckOperation(client);
          results.set(region.region, isHealthy);
        } catch {
          results.set(region.region, false);
        }
      } else {
        results.set(region.region, false);
      }
    }
    
    return results;
  }

  /**
   * Get healthy regions only
   */
  async getHealthyRegions<T>(
    healthCheckOperation: (client: T) => Promise<boolean>
  ): Promise<string[]> {
    const healthCheck = await this.healthCheck(healthCheckOperation);
    return Array.from(healthCheck.entries())
      .filter(([, isHealthy]) => isHealthy)
      .map(([region]) => region);
  }
}

/**
 * Create a multi-region manager for STS clients
 */
export function createMultiRegionSTSManager(config: MultiRegionConfig): MultiRegionManager {
  const manager = new MultiRegionManager(config);
  
  // Initialize STS clients for each region
  for (const regionConfig of config.regions) {
    const client = new STSClient({
      region: regionConfig.region,
      credentials: regionConfig.credentials,
    });
    
    manager['clients'].set(regionConfig.region, client);
  }
  
  return manager;
}

/**
 * Helper function to create a multi-region manager with common AWS regions
 */
export function createDefaultMultiRegionManager(
  credentials?: { accessKeyId: string; secretAccessKey: string; sessionToken?: string }
): MultiRegionManager {
  const defaultRegions: RegionConfig[] = [
    { region: 'us-east-1', priority: 1 },
    { region: 'us-west-2', priority: 2 },
    { region: 'eu-west-1', priority: 3 },
    { region: 'ap-southeast-1', priority: 4 },
  ];

  if (credentials) {
    defaultRegions.forEach(region => {
      region.credentials = credentials;
    });
  }

  return createMultiRegionSTSManager({
    regions: defaultRegions,
    enableFailover: true,
    maxRetries: 3,
    retryDelay: 1000,
  });
}
