'use strict';

const angular = require('angular');

import { IController } from 'angular';
import { IModalServiceInstance } from 'angular-ui-bootstrap';

import { ServerGroupReader } from '../../../../core/src/serverGroup/serverGroupReader.service';
import { IServerGroup } from '../../../../core/src/domain/index';

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

  public $onInit(): void {
    this.viewState = {
      loading: true,
      error: false,
    };

    ServerGroupReader.getScalingActivities(this.serverGroup).then(
      () => {
        this.viewState.loading = false;
      },
      () => {
        this.viewState.error = true;
      },
    );
  }

  public close(): void {
    this.$uibModalInstance.close();
  }
}

export const EVENTS_CTRL = 'spinnaker.ecs.serverGroup.events.controller';
module.exports = angular.module(EVENTS_CTRL, []).controller('EventsController', EventsController);
