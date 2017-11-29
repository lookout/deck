'use strict';

const angular = require('angular');

import {
  OVERRIDE_REGISTRY,
  SERVER_GROUP_COMMAND_REGISTRY_PROVIDER,
  SERVER_GROUP_WRITER,
  TASK_MONITOR_BUILDER,
  V2_MODAL_WIZARD_SERVICE
} from '@spinnaker/core';

import { ECS_SERVER_GROUP_CONFIGURATION_SERVICE } from '../serverGroupConfiguration.service';
import { ECS_CLUSTER_READ_SERVICE } from '../../../ecsCluster/ecsCluster.read.service';
import { IAM_ROLE_READ_SERVICE } from '../../../iamRoles/iamRole.read.service';

module.exports = angular.module('spinnaker.ecs.cloneServerGroup.controller', [
  require('@uirouter/angularjs').default,
  ECS_SERVER_GROUP_CONFIGURATION_SERVICE,
  SERVER_GROUP_WRITER,
  TASK_MONITOR_BUILDER,
  V2_MODAL_WIZARD_SERVICE,
  OVERRIDE_REGISTRY,
  SERVER_GROUP_COMMAND_REGISTRY_PROVIDER,
  IAM_ROLE_READ_SERVICE,
  ECS_CLUSTER_READ_SERVICE
])
  .controller('ecsCloneServerGroupCtrl', function($scope, $uibModalInstance, $q, $state,
                                                  serverGroupWriter,
                                                  v2modalWizardService,
                                                  taskMonitorBuilder,
                                                  overrideRegistry,
                                                  ecsServerGroupConfigurationService,
                                                  serverGroupCommandRegistry,
                                                  serverGroupCommand,
                                                  iamRoleReader,
                                                  ecsClusterReader,
                                                  application,
                                                  title) {
    $scope.pages = {
      templateSelection: overrideRegistry.getTemplate('ecs.serverGroup.templateSelection', require('./templateSelection/templateSelection.html')),
      basicSettings: overrideRegistry.getTemplate('ecs.serverGroup.basicSettings', require('./location/basicSettings.html')),
      capacity: overrideRegistry.getTemplate('ecs.serverGroup.capacity', require('./capacity/capacity.html')),
      loadBalancers: overrideRegistry.getTemplate('ecs.serverGroup.loadBalancers', require('./loadBalancers/loadBalancers.html')),
      advancedSettings: overrideRegistry.getTemplate('ecs.serverGroup.advancedSettings', require('./advancedSettings/advancedSettings.html')),
    };

    $scope.title = title;

    $scope.applicationName = application.name;
    $scope.application = application;

    $scope.command = serverGroupCommand;

    $scope.state = {
      loaded: false,
      requiresTemplateSelection: !!serverGroupCommand.viewState.requiresTemplateSelection,
    };

    this.templateSelectionText = {
      copied: [
        'account, region, subnet, cluster name (stack, details)',
        'load balancers',
        'all fields on the Advanced Settings page'
      ],
      notCopied: [
        'the following suspended scaling processes: Launch, Terminate, AddToLoadBalancer',
      ],
      additionalCopyText: 'If a server group exists in this cluster at the time of deployment, its scaling policies will be copied over to the new server group.'
    };
    if (!$scope.command.viewState.disableStrategySelection) {
      this.templateSelectionText.notCopied.push('the deployment strategy (if any) used to deploy the most recent server group');
    }

    function onApplicationRefresh() {
      // If the user has already closed the modal, do not navigate to the new details view
      if ($scope.$$destroyed) {
        return;
      }
      let cloneStage = $scope.taskMonitor.task.execution.stages.find((stage) => stage.type === 'cloneServerGroup');
      if (cloneStage && cloneStage.context['deploy.server.groups']) {
        let newServerGroupName = cloneStage.context['deploy.server.groups'][$scope.command.region];
        if (newServerGroupName) {
          var newStateParams = {
            serverGroup: newServerGroupName,
            accountId: $scope.command.credentials,
            region: $scope.command.region,
            provider: 'ecs',
          };
          var transitionTo = '^.^.^.clusters.serverGroup';
          if ($state.includes('**.clusters.serverGroup')) {  // clone via details, all view
            transitionTo = '^.serverGroup';
          }
          if ($state.includes('**.clusters.cluster.serverGroup')) { // clone or create with details open
            transitionTo = '^.^.serverGroup';
          }
          if ($state.includes('**.clusters')) { // create new, no details open
            transitionTo = '.serverGroup';
          }
          $state.go(transitionTo, newStateParams);
        }
      }
    }

    function onTaskComplete() {
      application.serverGroups.refresh();
      application.serverGroups.onNextRefresh($scope, onApplicationRefresh);
    }

    $scope.taskMonitor = taskMonitorBuilder.buildTaskMonitor({
      application: application,
      title: 'Creating your server group',
      modalInstance: $uibModalInstance,
      onTaskComplete: onTaskComplete,
    });

    function configureCommand() {
      ecsServerGroupConfigurationService.configureCommand(application, serverGroupCommand).then(function () {
        $scope.state.loaded = true;
        initializeCommand();
        initializeSelectOptions();
        initializeWatches();
      });
    }


    function initializeWatches() {
      $scope.$watch('command.credentials', createResultProcessor($scope.command.credentialsChanged));
      $scope.$watch('command.region', createResultProcessor($scope.command.regionChanged));
      $scope.$watch('command.placementStrategyName', createResultProcessor($scope.command.placementStrategyNameChanged));
      $scope.$watch('command.stack', $scope.command.clusterChanged);
      $scope.$watch('command.freeFormDetails', $scope.command.clusterChanged);

      // if any additional watches have been configured, add them
      serverGroupCommandRegistry.getCommandOverrides('ecs').forEach((override) => {
        if (override.addWatches) {
        override.addWatches($scope.command).forEach((watchConfig) => {
          $scope.$watch(watchConfig.property, watchConfig.method);
      });
      }
    });
    }

    // TODO: Move to service
    function initializeSelectOptions() {
      processCommandUpdateResult($scope.command.credentialsChanged());
      processCommandUpdateResult($scope.command.regionChanged());
    }

    function createResultProcessor(method) {
      return function() {
        processCommandUpdateResult(method());
      };
    }

    function processCommandUpdateResult(result) {
      // if (result.dirty.loadBalancers) {
      //   v2modalWizardService.markDirty('load-balancers');
      // }
      // if (result.dirty.targetGroups) {
      //   v2modalWizardService.markDirty('target-groups');
      // }
      // if (result.dirty.securityGroups) {
      //   v2modalWizardService.markDirty('security-groups');
      // }
      // if (result.dirty.availabilityZones) {
      //   v2modalWizardService.markDirty('capacity');
      // }
      // if (result.dirty.instanceType) {
      //   v2modalWizardService.markDirty('instance-type');
      // }
      // if (result.dirty.keyPair) {
      //   v2modalWizardService.markDirty('advanced');
      //   v2modalWizardService.markIncomplete('advanced');
      // }
      if (result) {
        v2modalWizardService.markComplete('advanced');
      } else {
        v2modalWizardService.markComplete('advanced');
      }
    }

    function initializeCommand() {

    }

    this.isValid = function () {
      return true;
      // $scope.command &&
      //   ($scope.command.viewState.disableImageSelection || $scope.command.amiName) &&
      //   ($scope.command.application) &&
      //   ($scope.command.credentials) && ($scope.command.instanceType) &&
      //   ($scope.command.region) && ($scope.command.availabilityZones) &&
      //   ($scope.command.capacity.min >= 0) && ($scope.command.capacity.max >= 0) &&
      //   ($scope.command.capacity.desired >= 0) &&
      //   $scope.form.$valid &&
      //   v2modalWizardService.isComplete();
    };

    this.showSubmitButton = function () {
      return v2modalWizardService.allPagesVisited();
    };

    this.submit = function () {
      if ($scope.command.viewState.mode === 'editPipeline' || $scope.command.viewState.mode === 'createPipeline') {
        return $uibModalInstance.close($scope.command);
      }
      $scope.taskMonitor.submit(
        function() {
          return serverGroupWriter.cloneServerGroup($scope.command, application);
        }
      );
    };

    this.cancel = function () {
      $uibModalInstance.dismiss();
    };

    if (!$scope.state.requiresTemplateSelection) {
      configureCommand();
    } else {
      $scope.state.loaded = true;
    }

    this.templateSelected = () => {
      $scope.state.requiresTemplateSelection = false;
      configureCommand();
    };
  });