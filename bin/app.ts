#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { DisasterRecoveryStack } from '../lib/disaster-recovery-stack';

const app = new cdk.App();
new DisasterRecoveryStack(app, 'DisasterRecoveryStack', {
  env: {
    account: '395929101814',
    region: 'us-east-2',
  }
});