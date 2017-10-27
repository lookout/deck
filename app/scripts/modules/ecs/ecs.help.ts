import { module } from 'angular';
import { HELP_CONTENTS_REGISTRY, HelpContentsRegistry } from 'core/help/helpContents.registry';

const helpContents: {[key: string]: string} = {
  'ecs.loadBalancer.targetGroup': '<p>A <em>target group</em> is attached to an application / network load balancer and are targets for load balancer traffic.</p>  <p> You need to create these resources outside of Spinnaker</p>',
  'ecs.serverGroup.stack': '<p>An environment variable available within your container, and on which you should base your application configuration at runtime.</p>  <p>Typical values for this parameter are <i>staging</i>, <i>prod</i>, etc.  Keep this parameter short!</p>',
  'ecs.serverGroup.detail': '<p>An environment variable available within your container, and on which you should base your application configuration at runtime.</p>  <p>Typical values for this parameter are <i>app</i>, <i>worker</i>, <i>migrator</i>, etc.  Keep this parameter short!</p>',
};

export const ECS_HELP = 'spinnaker.ecs.help.contents';
module(ECS_HELP, [HELP_CONTENTS_REGISTRY])
  .run((helpContentsRegistry: HelpContentsRegistry) => {
    Object.keys(helpContents).forEach(key => helpContentsRegistry.register(key, helpContents[key]));
  });
