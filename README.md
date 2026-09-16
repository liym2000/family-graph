# 谱记 · Family Graph

一个用于整理人物、记录亲属关系和浏览家族树的家谱管理应用。

[在线演示](https://family-demo.jiujiumu.top) · [Docker Hub](https://hub.docker.com/r/ymli/family-graph)

## 主要功能

- **家谱管理**：创建多个家谱，管理人物、备注和亲属关系。
- **家族树**：卡片树形、树形点图、径向全景，支持展开、缩放和人物定位。
- **人物查找**：按姓名搜索，按世代和性别筛选，查看上溯与后裔代数。
- **关系图谱**：查看人物之间的亲属联系。
- **导入导出**：JSON 家谱备份，以及 SVG/PDF 家族树导出。
- **只读演示**：通过配置关闭写入，保留浏览、搜索和导出。

在线演示只供浏览；演示资料不作为完整、权威的历史谱系来源。

## Docker 快速启动

需要 Docker 和 Docker Compose，当前发布镜像支持 `linux/amd64`。

下载部署文件到一个独立目录：

```bash
mkdir family-graph
cd family-graph
curl -fsSL https://raw.githubusercontent.com/liym2000/family-graph/main/docker/docker-compose.yml -o docker-compose.yml
docker compose pull
# 仅首次创建空数据库时执行；已有数据库跳过
docker compose run --rm app npm run db:init
docker compose up -d
```

访问 `http://服务器IP:12502`，数据保存在同目录的 `data/`。

端口和 `DEMO_READ_ONLY` 在 `docker-compose.yml` 中设置：`false` 可编辑，`true` 只读。修改后执行 `docker compose up -d`。

当前无登录鉴权，公开部署请开启只读。

## 本地开发

技术栈：Vue 3、TypeScript、Element Plus、NestJS、Node.js 内置 SQLite。需要 Node.js 24+。

```bash
npm --prefix backend ci
npm --prefix frontend ci
npm --prefix backend run build
# 仅全新项目执行
npm --prefix backend run db:init
```

分别在两个终端启动：

```bash
npm --prefix backend run start:dev
```

```bash
npm --prefix frontend run dev
```

访问 `http://127.0.0.1:9056`。可选配置见 [后端环境示例](backend/.env.example)。

## 许可证

[Apache License 2.0](LICENSE)。
