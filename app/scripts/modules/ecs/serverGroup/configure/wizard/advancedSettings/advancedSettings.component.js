'use strict';

const angular = require('angular');

import { V2_MODAL_WIZARD_SERVICE } from '@spinnaker/core';

import { AWSProviderSettings } from 'amazon/aws.settings';

module.exports = angular
  .module('spinnaker.ecs.serverGroup.configure.wizard.advancedSettings.component', [
    V2_MODAL_WIZARD_SERVICE,
  ])
  .component('ecsServerGroupAdvancedSettings', {
    bindings: {
      command: '=',
      application: '=',
    },
    templateUrl: require('./advancedSettings.component.html'),
    controller: function(v2modalWizardService) {
      this.fieldChanged = () => {
        if (this.command.keyPair) {
          v2modalWizardService.markComplete('advanced');
        }
      };
    }
  });
