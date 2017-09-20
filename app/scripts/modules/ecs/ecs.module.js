'use strict';

import { ECS_SERVER_GROUP_TRANSFORMER } from './serverGroup/serverGroup.transformer';
import { ECS_LOAD_BALANCER_SELECTOR } from './serverGroup/configure/wizard/loadBalancers/loadBalancerSelector.component';
import { SERVER_GROUP_DETAILS_MODULE } from './serverGroup/details/serverGroupDetails.module';

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
  SERVER_GROUP_DETAILS_MODULE,
  ECS_SERVER_GROUP_TRANSFORMER,
  require('./serverGroup/configure/wizard/advancedSettings/advancedSettings.component'),
  require('./serverGroup/configure/wizard/capacity/capacity.component'),
  ECS_LOAD_BALANCER_SELECTOR,
  require('./serverGroup/configure/serverGroupCommandBuilder.service'),
  require('./instance/details/instance.details.controller'),
  require('./pipeline/stages/findImageFromTags/ecsFindImageFromTagStage'),
  require('./pipeline/stages/destroyAsg/ecsDestroyAsgStage'),
  require('./pipeline/stages/disableAsg/ecsDisableAsgStage'),
  require('./pipeline/stages/disableCluster/ecsDisableClusterStage'),
  require('./pipeline/stages/enableAsg/ecsEnableAsgStage'),
  require('./pipeline/stages/resizeAsg/ecsResizeAsgStage'),
  require('./pipeline/stages/scaleDownCluster/ecsScaleDownClusterStage'),
  require('./pipeline/stages/shrinkCluster/awsShrinkClusterStage'),
])
  .config(function(cloudProviderRegistryProvider) {
    cloudProviderRegistryProvider.registerProvider('ecs',
      {
        name: 'EC2 Container Service',
        logo: { path: require('./logo/ecs.logo.svg')},
        serverGroup: {
          transformer: 'ecsServerGroupTransformer',
          detailsTemplateUrl: require('./serverGroup/details/serverGroupDetails.html'),
          detailsController: 'ecsServerGroupDetailsCtrl',
          cloneServerGroupTemplateUrl: require('./serverGroup/configure/wizard/serverGroupWizard.html'),
          cloneServerGroupController: 'ecsCloneServerGroupCtrl',
          commandBuilder: 'ecsServerGroupCommandBuilder',
          // configurationService: 'ecsServerGroupConfigurationService',
          scalingActivitiesEnabled: false,
        },
        instance: {
          detailsTemplateUrl: require('./instance/details/instanceDetails.html'),
          detailsController: 'ecsInstanceDetailsCtrl',
        },
      });
  });

DeploymentStrategyRegistry.registerProvider('ecs', ['redblack']);
