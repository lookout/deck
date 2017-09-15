'use strict';

const angular = require('angular');

module.exports = angular.module('spinnaker.ecs.pipeline.stage.scaleDownClusterStage', [
])
  .config(function(pipelineConfigProvider) {
    pipelineConfigProvider.registerStage({
      provides: 'scaleDownCluster',
      cloudProvider: 'ecs',
      templateUrl: require('./scaleDownClusterStage.html'),
      executionDetailsUrl: require('./scaleDownClusterExecutionDetails.html'),
      executionConfigSections: ['scaleDownClusterConfig', 'taskStatus'],
      accountExtractor: (stage) => [stage.context.credentials],
      configAccountExtractor: (stage) => [stage.credentials],
      validators: [
        { type: 'requiredField', fieldName: 'cluster' },
        { type: 'requiredField', fieldName: 'remainingFullSizeServerGroups', fieldLabel: 'Keep [X] full size Server Groups'},
        { type: 'requiredField', fieldName: 'regions', },
        { type: 'requiredField', fieldName: 'credentials', fieldLabel: 'account'},
      ],
      strategy: true,
    });
  }).controller('ecsScaleDownClusterStageCtrl', function($scope, accountService) {
    var ctrl = this;

    let stage = $scope.stage;

    $scope.state = {
      accounts: false,
      regionsLoaded: false
    };

    accountService.listAccounts('ecs').then(function (accounts) {
      $scope.accounts = accounts;
      $scope.state.accounts = true;
    });

    stage.regions = stage.regions || [];
    stage.cloudProvider = 'ecs';

    if (!stage.credentials && $scope.application.defaultCredentials.ecs) {
      stage.credentials = $scope.application.defaultCredentials.ecs;
    }
    if (!stage.regions.length && $scope.application.defaultRegions.ecs) {
      stage.regions.push($scope.application.defaultRegions.ecs);
    }

    if (stage.remainingFullSizeServerGroups === undefined) {
      stage.remainingFullSizeServerGroups = 1;
    }

    if (stage.allowScaleDownActive === undefined) {
      stage.allowScaleDownActive = false;
    }

    ctrl.pluralize = function(str, val) {
      if (val === 1) {
        return str;
      }
      return str + 's';
    };

    if (stage.preferLargerOverNewer === undefined) {
      stage.preferLargerOverNewer = 'false';
    }
    stage.preferLargerOverNewer = stage.preferLargerOverNewer.toString();
  });

