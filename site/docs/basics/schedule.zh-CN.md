---
title: 定时任务
order: 10
---

虽然我们通过框架开发的 HTTP Server 是请求响应模型的，但是仍然还会有许多场景需要执行一些定时任务，例如：

1. 定时上报应用状态。
2. 定时从远程接口更新本地缓存。
3. 定时进行文件切割、临时文件删除。

框架提供了一套机制来让定时任务的编写和维护更加优雅。
## 编写定时任务

所有的定时任务都统一存放在 `app/schedule` 目录下，每一个文件都是一个独立的定时任务，可以配置定时任务的属性和要执行的方法。

一个简单的例子，我们定义一个更新远程数据到内存缓存的定时任务，就可以在 `app/schedule` 目录下创建一个 `update_cache.js` 文件。

```js
const Subscription = require('egg').Subscription;

class UpdateCache extends Subscription {
  // 通过 schedule 属性来设置定时任务的执行间隔等配置
  static get schedule() {
    return {
      interval: '1m', // 1 分钟间隔
      type: 'all', // 指定所有的 worker 都需要执行
    };
  }

  // subscribe 是真正定时任务执行时被运行的函数
  async subscribe() {
    const res = await this.ctx.curl('http://www.api.com/cache', {
      dataType: 'json',
    });
    this.ctx.app.cache = res.data;
  }
}

module.exports = UpdateCache;
```

还可以简写为：

```js
module.exports = {
  schedule: {
    interval: '1m', // 1 分钟间隔
    type: 'all', // 指定所有的 worker 都需要执行
  },
  async task(ctx) {
    const res = await ctx.curl('http://www.api.com/cache', {
      dataType: 'json',
    });
    ctx.app.cache = res.data;
  },
};
```

这个定时任务会在每一个 Worker 进程上每 1 分钟执行一次，将远程数据请求回来挂载到 `app.cache` 上。

### 任务

- `task` 或 `subscribe` 同时支持 `generator function` 和 `async function`。
- `task` 的入参为 `ctx`，匿名的 Context 实例，可以通过它调用 `service` 等。

### 定时方式

定时任务可以指定 interval 或者 cron 两种不同的定时方式。

#### interval

通过 `schedule.interval` 参数来配置定时任务的执行时机，定时任务将会每间隔指定的时间执行一次。interval 可以配置成：

- 数字类型，单位为毫秒数，例如 `5000`。
- 字符类型，会通过 [ms](https://github.com/zeit/ms) 转换成毫秒数，例如 `5s`。

```js
module.exports = {
  schedule: {
    // 每 10 秒执行一次
    interval: '10s',
  },
};
```

#### cron

通过 `schedule.cron` 参数来配置定时任务的执行时机，定时任务将会按照 cron 表达式在特定的时间点执行。cron 表达式通过 [cron-parser](https://github.com/harrisiirak/cron-parser) 进行解析。

**注意：cron-parser 支持可选的秒（linux crontab 不支持）。**

```bash
* * * * * *
┬ ┬ ┬ ┬ ┬ ┬
│ │ │ │ │ │
│ │ │ │ │ └─ 周日（0 - 7）（0 或 7 是周日）
│ │ │ │ └─── 月份（1 - 12）
│ │ │ └───── 日期（1 - 31）
│ │ └─────── 小时（0 - 23）
│ └───────── 分钟（0 - 59）
└─────────── 秒（0 - 59，可选）
```

```js
module.exports = {
  schedule: {
    // 每三小时准点执行一次
    cron: '0 0 */3 * * *',
  },
};
```

### 类型

框架提供的定时任务默认支持两种类型，worker 和 all。worker 和 all 都支持上面的两种定时方式，只是当到执行时机时，会执行定时任务的 worker 不同：

- `worker` 类型：每台机器上只有一个 worker 会执行这个定时任务，每次执行定时任务的 worker 的选择是随机的。
- `all` 类型：每台机器上的每个 worker 都会执行这个定时任务。

### 其他参数

除了上述介绍的几个参数，定时任务还支持以下参数：

- `cronOptions`：配置 cron 的时区等，参见 [cron-parser](https://github.com/harrisiirak/cron-parser#options) 文档。
- `immediate`：配置该参数为 true 时，这个定时任务会在应用启动并 ready 后立即执行一次这个定时任务。
- `disable`：配置该参数为 true 时，这个定时任务不会被启动。
- `env`：数组，仅在指定的环境下才启动该定时任务。

### 执行日志

执行日志会输出到 `${appInfo.root}/logs/{app_name}/egg-schedule.log`，默认不会输出到控制台，可以通过 `config.customLogger.scheduleLogger` 来自定义。

```js
// config/config.default.js
config.customLogger = {
  scheduleLogger: {
    // consoleLevel: 'NONE',
    // file: path.join(appInfo.root, 'logs', appInfo.name, 'egg-schedule.log'),
  },
};
```
### 动态配置定时任务

有时候，我们需要配置定时任务的参数。定时任务还可以支持另一种写法：

```js
module.exports = (app) => {
  return {
    schedule: {
      interval: app.config.cacheTick,
      type: 'all',
    },
    async task(ctx) {
      const res = await ctx.curl('http://www.api.com/cache', {
        contentType: 'json',
      });
      ctx.app.cache = res.data;
    },
  };
};
```

## 手动执行定时任务

我们可以通过 `app.runSchedule(schedulePath)` 来运行一个定时任务。`app.runSchedule` 接受一个定时任务文件路径（位于 `app/schedule` 目录下的相对路径或者完整的绝对路径），执行对应的定时任务，并返回一个 Promise 对象。

在以下场景中，我们可能需要手动执行定时任务：

- 手动执行定时任务可以更优雅地编写定时任务的单元测试。

```js
const mm = require('@eggjs/mock');
const assert = require('assert');

it('should schedule work fine', async () => {
  const app = mm.app();
  await app.ready();
  await app.runSchedule('update_cache');
  assert(app.cache);
});
```

- 应用启动时，可以手动执行定时任务进行系统初始化。在初始化完毕后，再启动应用。具体可以参见[应用启动自定义](./app-start.md)章节。我们可以在 `app.js` 中编写初始化逻辑。

```js
module.exports = (app) => {
  app.beforeStart(async () => {
    // 保证应用启动监听端口前，数据已经准备好
    // 后续数据的更新由定时任务自动触发
    await app.runSchedule('update_cache');
  });
};
```

## 扩展定时任务类型

虽然默认的框架提供的定时任务只支持单个进程执行和全部进程执行，但是在某些情况下，比如服务非单机部署时，我们可能需要集群中的某一个进程执行定时任务。

虽然框架没有直接提供此功能，开发者可在上层框架中自行扩展新的定时任务类型。

在 `agent.js` 中，继承 `agent.ScheduleStrategy`，然后通过 `agent.schedule.use()` 方法注册即可：

```js
module.exports = (agent) => {
  class ClusterStrategy extends agent.ScheduleStrategy {
    start() {
      // 订阅其他分布式调度服务发送的消息，收到消息后让一个进程执行定时任务
      // 用户可以在定时任务的 schedule 属性中配置分布式调度的场景（scene）
      agent.mq.subscribe(this.schedule.scene, () => this.sendOne());
    }
  }
  agent.schedule.use('cluster', ClusterStrategy);
};
```

`ScheduleStrategy` 基类提供了以下方法：

- `this.schedule` - 定时任务的属性，所有任务默认支持的 `disable` 属性，以及其他自定义配置的解析。
- `this.sendOne(...args)` - 随机通知某个 worker 执行 task，`args` 会传递给 `subscribe(...args)` 或 `task(ctx, ...args)` 方法。
- `this.sendAll(...args)` - 通知所有的 worker 执行 task。
