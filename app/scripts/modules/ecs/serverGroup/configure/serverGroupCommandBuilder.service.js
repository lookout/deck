'use strict';

const angular = require('angular');
import _ from 'lodash';

import { ACCOUNT_SERVICE, INSTANCE_TYPE_SERVICE, NAMING_SERVICE } from '@spinnaker/core';

import { ECS_SERVER_GROUP_CONFIGURATION_SERVICE } from './serverGroupConfiguration.service';

module.exports = angular.module('spinnaker.ecs.serverGroupCommandBuilder.service', [
  ACCOUNT_SERVICE,
  INSTANCE_TYPE_SERVICE,
  NAMING_SERVICE,
  ECS_SERVER_GROUP_CONFIGURATION_SERVICE,
])
  .factory('ecsServerGroupCommandBuilder', function ($q,
                                                     accountService,
                                                     namingService,
                                                     instanceTypeService,
                                                     ecsServerGroupConfigurationService) {

    const CLOUD_PROVIDER = 'ecs';

    function buildNewServerGroupCommand (application, defaults) {
      defaults = defaults || {};
      var credentialsLoader = accountService.getCredentialsKeyedByAccount('ecs');

      var defaultCredentials = defaults.account || application.defaultCredentials.ecs;
      var defaultRegion = defaults.region || application.defaultRegions.ecs;

      var preferredZonesLoader = accountService.getAvailabilityZonesForAccountAndRegion('ecs', defaultCredentials, defaultRegion);


      return $q.all({
        preferredZones: preferredZonesLoader,
        credentialsKeyedByAccount: credentialsLoader,
      })
        .then(function (asyncData) {
          var availabilityZones = asyncData.preferredZones;

          var credentials = asyncData.credentialsKeyedByAccount[defaultCredentials];
          var keyPair = credentials ? credentials.defaultKeyPair : null;


          var defaultIamRole = 'poc-role';
          defaultIamRole = defaultIamRole.replace('{{application}}', application.name);


          var command = {
            application: application.name,
            credentials: defaultCredentials,
            region: defaultRegion,
            strategy: '',
            capacity: {
              min: 1,
              max: 1,
              desired: 1
            },
            targetHealthyDeployPercentage: 100,
            cooldown: 10,
            enabledMetrics: [],
            healthCheckType: 'EC2',
            healthCheckGracePeriod: 600,
            instanceMonitoring: false,
            ebsOptimized: false,
            selectedProvider: 'ecs',
            iamRole: defaultIamRole,
            terminationPolicies: ['Default'],
            availabilityZones: availabilityZones,
            keyPair: keyPair,
            iamRoles: [],
            suspendedProcesses: [],
            securityGroups: [],
            ecsClusterName: '',
            ecsClusters: [],
            targetGroup: '',
            spotPrice: null,
            tags: {},
            viewState: {
              useAllImageSelection: false,
              useSimpleCapacity: true,
              usePreferredZones: true,
              mode: defaults.mode || 'create',
              disableStrategySelection: true,
              dirty: {},
            },
          };

          if (application.attributes && application.attributes.platformHealthOnlyShowOverride && application.attributes.platformHealthOnly) {
            command.interestingHealthProviderNames = ['ecs'];
          }

          return command;
        });
    }

    function buildServerGroupCommandFromPipeline(application, originalCluster) {

      var pipelineCluster = _.cloneDeep(originalCluster);
      var region = Object.keys(pipelineCluster.availabilityZones)[0];
      // var instanceTypeCategoryLoader = instanceTypeService.getCategoryForInstanceType('ecs', pipelineCluster.instanceType);
      var commandOptions = { account: pipelineCluster.account, region: region };
      var asyncLoader = $q.all({command: buildNewServerGroupCommand(application, commandOptions)});

      return asyncLoader.then(function(asyncData) {
        var command = asyncData.command;
        var zones = pipelineCluster.availabilityZones[region];
        var usePreferredZones = zones.join(',') === command.availabilityZones.join(',');

        var viewState = {
          instanceProfile: asyncData.instanceProfile,
          disableImageSelection: true,
          useSimpleCapacity: pipelineCluster.capacity.min === pipelineCluster.capacity.max && pipelineCluster.useSourceCapacity !== true,
          usePreferredZones: usePreferredZones,
          mode: 'editPipeline',
          submitButtonLabel: 'Done',
          templatingEnabled: true,
          existingPipelineCluster: true,
          dirty: {},
        };

        var viewOverrides = {
          region: region,
          credentials: pipelineCluster.account,
          availabilityZones: pipelineCluster.availabilityZones[region],
          viewState: viewState,
        };

        pipelineCluster.strategy = pipelineCluster.strategy || '';

        return angular.extend({}, command, pipelineCluster, viewOverrides);
      });

    }

    // Only used to prepare view requiring template selecting
    function buildNewServerGroupCommandForPipeline() {
      return $q.when({
        viewState: {
          requiresTemplateSelection: true,
        }
      });
    }

    function buildUpdateServerGroupCommand(serverGroup) {
      var command = {
        type: 'modifyAsg',
        asgs: [
          { asgName: serverGroup.name, region: serverGroup.region }
        ],
        cooldown: serverGroup.asg.defaultCooldown,
        enabledMetrics: _.get(serverGroup, 'asg.enabledMetrics', []).map(m => m.metric),
        healthCheckGracePeriod: serverGroup.asg.healthCheckGracePeriod,
        healthCheckType: serverGroup.asg.healthCheckType,
        terminationPolicies: angular.copy(serverGroup.asg.terminationPolicies),
        credentials: serverGroup.account
      };
      ecsServerGroupConfigurationService.configureUpdateCommand(command);
      return command;
    }

    function buildServerGroupCommandFromExisting(application, serverGroup, mode = 'clone') {
      var preferredZonesLoader = accountService.getPreferredZonesByAccount('ecs');

      var serverGroupName = namingService.parseServerGroupName(serverGroup.asg.autoScalingGroupName);

      var asyncLoader = $q.all({
        preferredZones: preferredZonesLoader,
      });

      return asyncLoader.then(function(asyncData) {
        var zones = serverGroup.asg.availabilityZones.sort();
        var usePreferredZones = false;
        var preferredZonesForAccount = asyncData.preferredZones[serverGroup.account];
        if (preferredZonesForAccount) {
          var preferredZones = preferredZonesForAccount[serverGroup.region].sort();
          usePreferredZones = zones.join(',') === preferredZones.join(',');
        }

        // These processes should never be copied over, as the affect launching instances and enabling traffic
        let enabledProcesses = ['Launch', 'Terminate', 'AddToLoadBalancer'];


        var command = {
          application: application.name,
          strategy: '',
          stack: serverGroupName.stack,
          freeFormDetails: serverGroupName.freeFormDetails,
          credentials: serverGroup.account,
          cooldown: serverGroup.asg.defaultCooldown,
          enabledMetrics: _.get(serverGroup, 'asg.enabledMetrics', []).map(m => m.metric),
          healthCheckGracePeriod: serverGroup.asg.healthCheckGracePeriod,
          healthCheckType: serverGroup.asg.healthCheckType,
          terminationPolicies: serverGroup.asg.terminationPolicies,
          loadBalancers: serverGroup.asg.loadBalancerNames,
          region: serverGroup.region,
          useSourceCapacity: false,
          capacity: {
            'min': serverGroup.asg.minSize,
            'max': serverGroup.asg.maxSize,
            'desired': serverGroup.asg.desiredCapacity
          },
          targetHealthyDeployPercentage: 100,
          availabilityZones: zones,
          selectedProvider: CLOUD_PROVIDER,
          spotPrice: null,
          source: {
            account: serverGroup.account,
            region: serverGroup.region,
            asgName: serverGroup.asg.autoScalingGroupName,
          },
          suspendedProcesses: (serverGroup.asg.suspendedProcesses || [])
            .map((process) => process.processName)
            .filter((name) => !enabledProcesses.includes(name)),
          tags: serverGroup.tags || {},
          targetGroup: serverGroup.targetGroup,
          viewState: {
            instanceProfile: asyncData.instanceProfile,
            useAllImageSelection: false,
            useSimpleCapacity: serverGroup.asg.minSize === serverGroup.asg.maxSize,
            usePreferredZones: usePreferredZones,
            mode: mode,
            isNew: false,
            dirty: {},
          },
        };

        if (application.attributes && application.attributes.platformHealthOnlyShowOverride && application.attributes.platformHealthOnly) {
          command.interestingHealthProviderNames = ['Amazon'];
        }

        if (mode === 'clone' || mode === 'editPipeline') {
          command.useSourceCapacity = true;
          command.viewState.useSimpleCapacity = false;
        }

        if (mode === 'editPipeline') {
          command.strategy = 'redblack';
          command.suspendedProcesses = [];
        }

        if (serverGroup.launchConfig) {
          angular.extend(command, {
            instanceType: serverGroup.launchConfig.instanceType,
            iamRole: serverGroup.launchConfig.iamInstanceProfile,
            keyPair: serverGroup.launchConfig.keyName,
            associatePublicIpAddress: serverGroup.launchConfig.associatePublicIpAddress,
            ramdiskId: serverGroup.launchConfig.ramdiskId,
            instanceMonitoring: serverGroup.launchConfig.instanceMonitoring.enabled,
            ebsOptimized: serverGroup.launchConfig.ebsOptimized,
          });
          if (serverGroup.launchConfig.userData) {
            command.base64UserData = serverGroup.launchConfig.userData;
          }
          command.viewState.imageId = serverGroup.launchConfig.imageId;
        }

        if (serverGroup.launchConfig && serverGroup.launchConfig.securityGroups.length) {
          command.securityGroups = serverGroup.launchConfig.securityGroups;
        }
        return command;
      });
    }

    return {
      buildNewServerGroupCommand: buildNewServerGroupCommand,
      buildServerGroupCommandFromExisting: buildServerGroupCommandFromExisting,
      buildNewServerGroupCommandForPipeline: buildNewServerGroupCommandForPipeline,
      buildServerGroupCommandFromPipeline: buildServerGroupCommandFromPipeline,
      buildUpdateServerGroupCommand: buildUpdateServerGroupCommand,
    };
});
