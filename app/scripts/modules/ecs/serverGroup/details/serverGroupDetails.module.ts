import { module } from 'angular';

export const SERVER_GROUP_DETAILS_MODULE = 'spinnaker.amazon.serverGroup.details';
module(SERVER_GROUP_DETAILS_MODULE, [
  require('./serverGroupDetails.ecs.controller.js'),
]);
