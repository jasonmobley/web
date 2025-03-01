// @ts-ignore
import { DevServerCoreConfig, getRequestFilePath, Plugin } from '@web/dev-server-core';
import { mdjsToCsf } from 'storybook-addon-markdown-docs';

import { StorybookPluginConfig } from '../shared/config/StorybookPluginConfig.js';
import { createManagerHtml } from '../shared/html/createManagerHtml.js';
import { createPreviewHtml } from '../shared/html/createPreviewHtml.js';
import { readStorybookConfig } from '../shared/config/readStorybookConfig.js';
import { validatePluginConfig } from '../shared/config/validatePluginConfig.js';
import { findStories } from '../shared/stories/findStories.js';
import { transformMdxToCsf } from '../shared/mdx/transformMdxToCsf.js';
import { injectExportsOrder } from '../shared/stories/injectExportsOrder.js';

const regexpReplaceWebsocket = /<!-- injected by web-dev-server -->(.|\s)*<\/script>/m;

interface Context {
  URL: URL;
  path: string;
  body: unknown;
  url: string;
}

export function storybookPlugin(pluginConfig: StorybookPluginConfig): Plugin {
  validatePluginConfig(pluginConfig);

  let serverConfig: DevServerCoreConfig;
  let storyImports: string[] = [];
  let storyFilePaths: string[] = [];

  return {
    name: 'storybook',

    serverStart(args: { config: unknown }) {
      serverConfig = args.config;
    },

    resolveMimeType(context: Context) {
      if (context.URL.searchParams.get('story') !== 'true') {
        return;
      }

      if (context.path.endsWith('.mdx') || context.path.endsWith('.md')) {
        return 'js';
      }
    },

    async transform(context: Context) {
      if (typeof context.body !== 'string') {
        return;
      }

      if (context.path === '/') {
        // replace the injected websocket script to avoid reloading the manager in watch mode
        context.body = context.body.replace(regexpReplaceWebsocket, '');
        return;
      }

      if (context.URL.searchParams.get('story') !== 'true') {
        return;
      }

      const filePath = getRequestFilePath(context.url, serverConfig.rootDir);
      if (context.path.endsWith('.mdx')) {
        context.body = await transformMdxToCsf(context.body, filePath);
      }

      if (context.path.endsWith('.md')) {
        context.body = await mdjsToCsf(context.body as string, filePath, pluginConfig.type);
      }

      if (storyFilePaths.includes(filePath)) {
        // inject story order, note that MDX and MD and fall through to this as well
        context.body = await injectExportsOrder(context.body as string, filePath);
      }
    },

    async serve(context: Context) {
      const storybookConfig = await readStorybookConfig(pluginConfig);
      if (context.path === '/') {
        return { type: 'html', body: createManagerHtml(storybookConfig, serverConfig.rootDir) };
      }

      if (context.path === '/iframe.html') {
        ({ storyImports, storyFilePaths } = await findStories(
          serverConfig.rootDir,
          storybookConfig.mainJsPath,
          storybookConfig.mainJs.stories,
        ));
        storyImports = storyImports.map(i => `${i}?story=true`);

        return {
          type: 'html',
          body: createPreviewHtml(
            pluginConfig,
            storybookConfig,
            serverConfig.rootDir,
            storyImports,
          ),
        };
      }
    },
  };
}
