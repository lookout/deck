'use strict';

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
  // require('./serverGroup/configure/wizard/CloneServerGroup.ecs.controller'),
])
  .config(function(cloudProviderRegistryProvider) {
    cloudProviderRegistryProvider.registerProvider('ecs',
      {
        name: 'EC2 Container Service',
        logo: { path: require('./logo/ecs.icon.svg')},
        serverGroup: {
          transformer: 'awsServerGroupTransformer',
          // detailsTemplateUrl: require('../amazon/src/serverGroup/details/serverGroupDetails.html'),
          // detailsController: 'awsServerGroupDetailsCtrl',
          cloneServerGroupTemplateUrl: require('./serverGroup/configure/wizard/serverGroupWizard.html'),
          cloneServerGroupController: 'awsCloneServerGroupCtrl',
          commandBuilder: 'awsServerGroupCommandBuilder',
          // configurationService: 'awsServerGroupConfigurationService',
          scalingActivitiesEnabled: false,
        },
      });
  });
