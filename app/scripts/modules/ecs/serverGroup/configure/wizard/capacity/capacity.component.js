'use strict';

const angular = require('angular');

import { V2_MODAL_WIZARD_SERVICE } from '@spinnaker/core';

module.exports = angular
  .module('spinnaker.ecs.serverGroup.configure.wizard.autoscaling.component', [
    V2_MODAL_WIZARD_SERVICE,
  ])
  .component('ecsServerGroupAutoScaling', {
    bindings: {
      command: '=',
      application: '=',
    },
    templateUrl: require('./capacity.component.html'),
  });
