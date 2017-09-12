'use strict';

import { ECS_SERVER_GROUP_TRANSFORMER } from './serverGroup/serverGroup.transformer';
import { ECS_LOAD_BALANCER_SELECTOR } from './serverGroup/configure/wizard/loadBalancers/loadBalancerSelector.component';
import { ECS_SECURITY_GROUPS_REMOVED } from './serverGroup/configure/wizard/securityGroups/securityGroupsRemoved.component';

import { DeploymentStrategyRegistry } from '@spinnaker/core';

let angular = require('angular');

require('./logo/ecs.logo.less');
require('./ecs.settings.ts');

// load all templates into the $templateCache
let templates = require.context('./', true, /\.html$/);
templates.keys().forEach(function(key) {
  templates(key);
});

module.exports = angular.module('spinnaker.ecs', [
  require('./pipeline/stages/cloneServerGroup/ecsCloneServerGroupStage'),
  require('./serverGroup/configure/wizard/CloneServerGroup.ecs.controller'),
  ECS_SERVER_GROUP_TRANSFORMER,
  require('./serverGroup/configure/wizard/advancedSettings/advancedSettings.component'),
  require('./serverGroup/configure/wizard/capacity/capacity.component'),
  ECS_LOAD_BALANCER_SELECTOR,
  ECS_SECURITY_GROUPS_REMOVED,
  require('./serverGroup/configure/wizard/securityGroups/securityGroupSelector.directive.js'),
  require('./serverGroup/configure/serverGroupCommandBuilder.service'),
])
  .config(function(cloudProviderRegistryProvider) {
    cloudProviderRegistryProvider.registerProvider('ecs',
      {
        name: 'EC2 Container Service',
        logo: { path: require('./logo/ecs.logo.svg')},
        serverGroup: {
          transformer: 'ecsServerGroupTransformer',
          // detailsTemplateUrl: require('../ecs/src/serverGroup/details/serverGroupDetails.html'),
          // detailsController: 'ecsServerGroupDetailsCtrl',
          cloneServerGroupTemplateUrl: require('./serverGroup/configure/wizard/serverGroupWizard.html'),
          cloneServerGroupController: 'ecsCloneServerGroupCtrl',
          commandBuilder: 'ecsServerGroupCommandBuilder',
          // configurationService: 'ecsServerGroupConfigurationService',
          scalingActivitiesEnabled: false,
        },
      });
  });

DeploymentStrategyRegistry.registerProvider('ecs', ['redblack']);
