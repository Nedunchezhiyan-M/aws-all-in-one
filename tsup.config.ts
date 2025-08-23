import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    'index': 'src/index.ts',
    'assume-role': 'src/assume-role.ts',
    'multi-region': 'src/multi-region.ts',
    'policy-builder': 'src/policy-builder.ts',
    's3-deployer': 'src/s3-deployer.ts',
    's3-utils': 'src/s3-utils.ts',
    'kms-utils': 'src/kms-utils.ts',
    'messaging': 'src/messaging.ts',
    'step-functions': 'src/step-functions.ts',
  },
  format: ['cjs', 'esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  minify: false,
  treeshake: true,
  external: [
    '@aws-sdk/client-sts',
    '@aws-sdk/client-s3',
    '@aws-sdk/client-cloudfront',
    '@aws-sdk/client-kms',
    '@aws-sdk/client-sns',
    '@aws-sdk/client-sqs',
    '@aws-sdk/client-eventbridge',
    '@aws-sdk/client-sfn',
    '@aws-sdk/client-iam',
    '@aws-sdk/s3-request-presigner',
    '@aws-sdk/lib-storage',
    'mime-types'
  ],
});
