import { module } from 'angular';
import { has } from 'lodash';

export const ECS_SECURITY_GROUPS_REMOVED = 'spinnaker.ecs.serverGroup.configure.wizard.securityGroups.removed';
module(ECS_SECURITY_GROUPS_REMOVED, [])
  .component('ecsServerGroupSecurityGroupsRemoved', {
      templateUrl: require('./securityGroupsRemoved.component.html'),
      bindings: {
        command: '=',
        removed: '=',
      },
      controller: function () {
        this.acknowledgeSecurityGroupRemoval = () => {
          if (has(this.command, 'viewState.dirty')) {
            this.command.viewState.dirty.securityGroups = null;
          }
          if (this.removed && this.removed.length) {
            this.removed.length = 0;
          }
        };
      }
    }
  );
