import { IController, IComponentOptions, module } from 'angular';
import { IModalService } from 'angular-ui-bootstrap';
import { EVENTS_CTRL, EventsController } from './events.controller';

class ViewScalingActivitiesLinkCtrl implements IController {
  public serverGroup: any;

  public constructor(private $uibModal: IModalService) {
    'ngInject';
  }

  public showScalingActivities(): void {
    this.$uibModal.open({
      templateUrl: require('./events.html'),
      controller: EventsController,
      controllerAs: '$ctrl',
      resolve: {
        serverGroup: () => this.serverGroup,
      },
    });
  }
}

export class ViewEventsLink implements IComponentOptions {
  public bindings: any = {
    serverGroup: '<',
  };
  public controller: any = ViewScalingActivitiesLinkCtrl;
  public template = `BBBBBB <a href ng-click="$ctrl.showScalingActivities()">View Events</a>`;
}

export const VIEW_EVENTS_LINK = 'spinnaker.ecs.serverGroup.details.viewScalingActivities.link';

module(VIEW_EVENTS_LINK, [EVENTS_CTRL]).component('viewScalingActivitiesLink', new ViewEventsLink());
