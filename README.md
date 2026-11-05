# bitoolkit-website

[BIToolkit](https://github.com/bitoolkit) 的网站：一个总览页，以及每个公开项目的独立页面（`/<仓库名>/`）。

所有内容在构建时从 GitHub 读取，不需要手动维护：

- 组织名称、简介、免责声明、交流群和项目顺序来自 `bitoolkit/.github` 的 `profile/README.md`。yanhekit 和 BITree 固定排在最前，见 `src/lib/loaders.ts` 的 `PINNED_PROJECTS`。
- 项目页的标题、logo、简介、按钮和正文来自各仓库 README；下载列表来自最新 Release。
- 首页和项目页的大图取 README 里的第一张截图；README 没有截图时，取仓库里名为 `poster`、`cover`、`preview` 或 `screenshot` 开头的图片。
- 仓库公开、非 fork、未归档时自动出现在网站上。

## 开发

需要 Node.js 22.23.4 或更新版本。

```sh
npm install
GITHUB_TOKEN=$(gh auth token) npm run dev
```

不设置 `GITHUB_TOKEN` 也能构建，但 GitHub API 匿名请求每小时只有 60 次。

## 部署

`.github/workflows/deploy.yml` 把网站部署到 GitHub Pages。以下情况会重新构建：

- 推送到 `main`
- 每 6 小时一次，拉取最新的 README 和 Release
- 在 Actions 页面手动运行
- 收到 `project-updated` 事件。项目仓库可以在发布后触发它，让网站立即更新：

  ```sh
  gh api repos/bitoolkit/<本仓库名>/dispatches -f event_type=project-updated
  ```

在仓库设置中把 Pages 的来源设为 GitHub Actions。仓库名为 `bitoolkit.github.io` 时网站位于根路径，否则位于 `/<仓库名>/`，构建会自动适配。
