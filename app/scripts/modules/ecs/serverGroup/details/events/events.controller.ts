'use strict';

const angular = require('angular');

import { IController } from 'angular';
// import * as _ from 'lodash';
import { IModalServiceInstance } from 'angular-ui-bootstrap';

// import { ServerGroupReader } from '../../../../core/src/serverGroup/serverGroupReader.service';
import { IServerGroup } from '../../../../core/src/domain/index';
import { VIEW_EVENTS_LINK_COMPONENT } from './events.component';

export interface IScalingActivitiesViewState {
  loading: boolean;
  error: boolean;
}

export interface IScalingEvent {
  description: string;
  availabilityZone: string;
}

export interface IScalingEventSummary {
  cause: string;
  events: IScalingEvent[];
  startTime: number;
  statusCode: string;
  isSuccessful: boolean;
}

export interface IRawScalingActivity {
  details: string;
  description: string;
  cause: string;
  statusCode: string;
  startTime: number;
}

export class EventsController implements IController {
  public viewState: IScalingActivitiesViewState;
  public activities: IScalingEventSummary[] = [];

  public constructor(private $uibModalInstance: IModalServiceInstance, public serverGroup: IServerGroup) {
    'ngInject';
    this.serverGroup = serverGroup;
  }

  // private groupActivities(activities: IRawScalingActivity[]): void {
  //   const grouped: any = _.groupBy(activities, 'cause'),
  //     results: IScalingEventSummary[] = [];
  //
  //   _.forOwn(grouped, (group: IRawScalingActivity[]) => {
  //     if (group.length) {
  //       const events: IScalingEvent[] = [];
  //       group.forEach((entry: any) => {
  //         let availabilityZone = 'unknown';
  //         try {
  //           availabilityZone = JSON.parse(entry.details)['Availability Zone'] || availabilityZone;
  //         } catch (e) {
  //           // I don't imagine this would happen but let's not blow up the world if it does.
  //         }
  //         events.push({ description: entry.description, availabilityZone });
  //       });
  //       results.push({
  //         cause: group[0].cause,
  //         events,
  //         startTime: group[0].startTime,
  //         statusCode: group[0].statusCode,
  //         isSuccessful: group[0].statusCode === 'Successful',
  //       });
  //     }
  //   });
  //   this.activities = _.sortBy(results, 'startTime').reverse();
  // }

  public $onInit(): void {
    this.viewState = {
      loading: true,
      error: false,
    };
    this.viewState.error = true;
    // ServerGroupReader.getScalingActivities(this.serverGroup).then(
    //   (activities: IRawScalingActivity[]) => {
    //     this.viewState.loading = false;
    //     this.groupActivities(activities);
    //   },
    //   () => {
    //     this.viewState.error = true;
    //   },
    // );
  }

  public close(): void {
    this.$uibModalInstance.close();
  }
}

export const EVENTS_CTRL = 'spinnaker.ecs.serverGroup.events.controller';
module.exports = angular
  .module(EVENTS_CTRL, [VIEW_EVENTS_LINK_COMPONENT])
  .controller('EventsController', EventsController);
