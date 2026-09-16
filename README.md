# 谱记 · Family Graph

本地优先的家谱管理应用，支持多家谱、人物与亲属管理、树形和径向展示、关系路径，以及 JSON 备份。界面支持中文和英文，语言切换不翻译人物姓名及备注。

使用与维护说明集中在本文件；开发约束、界面规范和关键业务规则见 [AGENTS.md](AGENTS.md)。

## Docker

[服务器部署、初始化、导入和读写切换](docker/DEPLOYMENT.md)。演示与私人实例统一使用同一镜像，通过 `DEMO_READ_ONLY` 控制读写，数据独立。

## 启动

### Windows 本地开发

需要 Node.js 24+ 和 npm。后端通过 Node.js 内置 SQLite 读写项目根目录 `data/sqlite/family-graph.sqlite`，无需安装或启动独立数据库服务。

1. 全新项目复制 `backend/.env.example` 为 `backend/.env`；从旧电脑复制来的配置和 data 不要覆盖。
2. 在 `backend/` 和 `frontend/` 各执行一次 `npm ci`。
3. 仅全新空项目：在 `backend/` 执行 `npm run build`，再执行 `npm run db:init`。已有数据库跳过初始化；旧 PostgreSQL 项目按下文迁移。
4. 双击根目录 `1_start_family_graph.bat`。

| 入口 | 用途 |
| --- | --- |
| `1_start_family_graph.bat` | 检查 SQLite、构建后端并启动前后端 |
| `2_stop_family_graph.bat` | 停止前后端，释放数据库文件 |
| `3_status_family_graph.bat` | 检查进程和后端健康状态 |
| `4_restart_backend.bat` | 单独重启后端 |

启动和停止会核对服务进程是否属于当前项目；端口被其他程序或无法确认归属的进程占用时会报错，需要手动处理。四个入口保留执行退出码，状态检查中的数据库错误返回非零退出码。后端重启只要求后端依赖已安装。

前端地址为 `http://127.0.0.1:9056`，后端健康接口为 `http://127.0.0.1:9058/api/health`。服务在后台运行，日志位于 `data/`。手动启动时先在 backend 执行 `npm run build`、`npm run migrate`，再启动两端开发服务；前端把 `/api` 代理到后端。

`SQLITE_PATH` 相对项目根目录解析，与当前工作目录无关，默认 `data/sqlite/family-graph.sqlite`。文件缺失或版本不符时报错，不静默建立空库。使用参数化 SQL、外键、WAL 和 `BEGIN IMMEDIATE` 事务，同一应用内的查询与事务排队，防止其他请求混入未提交事务。

### Docker

Use `docker/docker-compose.yml` as the single deployment template. Copy it to each server deployment directory; edit the host port and `DEMO_READ_ONLY`. Database and backups are stored in `./data/` beside the Compose file. See [deployment instructions](docker/DEPLOYMENT.md) for initialization and migration from older named volumes.

## 页面与功能

| 页面 | 入口与功能 |
| --- | --- |
| 家谱列表 | `/`：新建家谱、选择家谱、导入 JSON |
| 家谱概览 | `/families/:familyId`：概览及最近浏览人物 |
| 人物档案 | `/people`：姓名搜索、世代及性别筛选；世代、上溯、后裔、子女表头切换升序、降序、默认，全部结果排序后分页，未知值最后；默认完整姓名优先，重名按世代排列；进入详情后原位编辑 |
| 人物详情 | `/person/:personId`：资料、亲属、新建或绑定关系 |
| 家族树 | `/tree`：树形/径向切换、分支浏览、展开后裔、查找高亮、缩放及导出 |
| 关系图谱 | `/graph`：人物上下代范围、多人关系路径 |
| 设置与备份 | `/settings`：家谱名称、姓氏、备注及 JSON 导出 |

表中除前两项外，路径均接在 `/families/:familyId` 后。列表筛选及页码保存在 URL；家族树可用 `person` 查询参数指定起点。语言偏好保存在浏览器 localStorage。

树形长辈在下、后代向上；树形点图复用树形分支布局，以圆点和紧凑间距展示；径向围绕起点发散。两种点图悬浮或聚焦后在侧边显示资料，支持展开、收起、查找与导出；树形点图的 SVG/PDF 同样使用圆点，SVG 的人物姓名和配偶保留在节点标题中。初始最多显示 200 人，手动展开上限 300 人；“更多 → 展开后裔”可以逐批加载当前根的全部后代，也可以停止。配偶名单不截断，查找会高亮人物及到根的实际路径。
树形点图优先让父母靠近后代较多的主支，保留子女顺序；高亮路径时仍可辨认周围分支。点图和径向图悬浮预览侧栏资料，点击圆点固定人物，点击另一圆点切换固定人物；关闭人物信息或按 Esc 解除固定。树形卡片点击打开详情。自动适应时跟随视口尺寸变化，手动缩放、拖动或定位后保持用户视野。
工具栏的“视图”下拉选择三种布局。人物搜索框同时用于“查看分支”和“查找定位”：前者更换起点，后者保留起点并定位、高亮所选人物；分支外人物会提示。全屏使用相同的操作和选择状态。

径向中同一父母的子女可按空间分成最多四排，包括仍有后代的子女；每排为完整支系留出空间，短支放在内侧，连线仍指向真实父母。同代人物不要求处于同一圆环。
末端子女组达到三人时至少分两列，避免沿一条射线堆成长串。布局后会尝试将长连线末端的小支系整体向内收，连线统一沿径向线段和圆弧转向，不使用跨射线的斜直线。检查人物与已有路径占位，没有安全空位时保留原位，不保证消除所有中心留白。

新建亲子关系可按首位录入配偶自动补充另一位家长；自动关系有来源标记，手动指定及排除记录优先。它是录入默认规则，不代表史料已证实的生物学关系。后裔代数表示已记录亲子路径的深度，0 表示未记录后裔。

## 数据存放与备份

**实际数据库保存在项目 `data/sqlite/family-graph.sqlite`，日常编辑直接写入这里。** 同目录可能有 `-wal` 和 `-shm` 文件，它们属于运行中的数据库，不要单独删除。`data/backups/` 保存完整备份及恢复校验报告，`data/postgres/` 等旧目录保留用于回退。

`data/` 和本地 `.env` 不进 Git 或镜像，不是可删除的缓存。Git clone 和 git archive 不携带真实数据。

### 换电脑或更改文件夹位置

1. 使用 `2_stop_family_graph.bat` 正常停止应用；Docker 使用 `docker compose stop app`。
2. 复制或压缩整个项目，包含 `data/` 和本地配置，复制完成前不要重新启动。可以省略 node_modules、dist 和测试产物。
3. 新电脑安装 Node.js 24+，在两端执行 `npm ci`，然后启动。SQLite 文件可跨操作系统迁移，无需 PostgreSQL。

### 完整备份与恢复验证

停止编辑，在 backend 构建后执行：

```powershell
npm run backup:verify
```

脚本使用 SQLite 备份 API 生成一致快照，写入 `data/backups/sqlite-<时间戳>/database.sqlite`，复制为 `restore-check.sqlite` 后打开验证全部表的行数、内容哈希、编号序列、完整性和外键，生成 `verification.json`。备份期间源数据变化会报错，需停止编辑后重试。Docker 内执行 `docker compose exec app npm run backup:verify`。

恢复时先停止应用，保留当前数据库及同目录 WAL/SHM 文件作为独立副本，再把已验证的 `database.sqlite` 复制到一个新的项目内目录，通过 `SQLITE_PATH` 指向它，执行 `npm run migrate` 检查并启动。不要覆盖运行中的数据库；恢复到历史时间点不包含之后的编辑。

| 方式 | 覆盖范围 |
| --- | --- |
| 界面 JSON 导出 | 单份家谱的人物、亲属、排除和有效校对确认，首页导入为新家谱 |
| SQLite 完整备份 | 所有家谱、编号序列、校对确认和历史快照 |
| PostgreSQL dump | 迁移前的完整数据库，可用匹配版本 pg_restore 恢复 |
| SVG / PDF | 家族树展示文件，不是可导入的数据备份 |

### 历史数据与回退

当前项目的安装、启动、维护和备份只使用 SQLite，不再安装 pg/node-pg-migrate，也不读取 DATABASE_URL。原 PostgreSQL 迁移文件保持不变，仅作为历史结构记录，不由当前迁移入口执行。

历史备注快照为 `archive_person_notes_before_merge`，原迁移记录为 `archive_postgres_migrations`，都已包含在 SQLite 完整备份中。单谱 JSON 不包含历史快照，删除家谱也不删除它们。

迁移前的 PostgreSQL 原库和 dump 保留用于回退，停止状态下不参与运行。旧版代码、原配置、过渡工具压缩包及回退说明保存在项目 `data/backups/`；工具压缩包含私有配置，不得公开。不要用原库覆盖当前 SQLite 数据。

需要回退时，先停止应用并备份当前 SQLite，把迁移前代码解压到独立目录，按备份中的 ROLLBACK.md 恢复原配置及 PostgreSQL 数据。回退不会自动带回迁移后的编辑；可以先导出相关家谱 JSON，旧版导入会创建新家谱。原库损坏时，使用匹配主版本的 pg_restore 将 dump 恢复到独立数据库，核对后再切换旧版连接。


## JSON 导入导出格式

当前格式为 `family_graph_export`，版本 `1`。首页导入 JSON，总是创建新家谱，不覆盖现有家谱；Excel 需先转换成此格式，当前没有通用 Excel 直接导入入口。

| 字段 | 含义 |
| --- | --- |
| `format` / `version` | `family_graph_export` / `1` |
| `family` | 名称、姓氏、六位小写字母或数字组成的 `person_prefix`、可选备注 |
| `people` | 文档内人物 ID、编号、姓名、世代、性别、备注及兼容来源字段 |
| `relations` | 引用文档人物 ID；`relation_type` 为 `parent` 或 `spouse` |
| `relations[].origin` | 可选 `manual` 或 `single_spouse`；缺省视为手动，自动关系导入后重新计算 |
| `excluded_auto_parents` | 可选 `from_person_id` / `to_person_id` 对，防止重建已排除的自动家长 |
| `reviewed_issues` | 可选有效校对确认：`type`、`person_ids`，世代异常另有 `parent_id` |
| `exportedAt` / `counts` | 导出说明信息，导入时不作为数据依据 |

导入重新分配数据库 ID 和时间戳；前缀可用时保留编号，冲突时分配新前缀并保留八位数字后缀。旧 `source` 并入备注，排除记录映射新 ID，校对确认重新计算指纹，仅恢复仍匹配的问题。缺少可选字段的旧 v1 文件仍可导入。

历史世代间隔保留；无效端点、重复关系、亲子循环等错误会拒绝整个导入，事务不留下部分数据。

家族树导出可选择树形或径向、当前内容或当前根全部后代。SVG 保留矢量节点和线条；PDF 通过浏览器打印选择整图或 A3 分幅，需在打印窗口完成保存。

## 项目结构

| 目录 | 职责 |
| --- | --- |
| `frontend/src/pages/`、`components/` | 路由页面及复用表单、选择器、导航、图形组件 |
| `frontend/src/features/tree/` | 树分支缓存、视口、查找、导出状态及专用组件 |
| `frontend/src/layout/`、`export/` | 纯布局算法及文件生成 |
| `frontend/src/composables/` | 当前家谱与家谱列表的共享状态 |
| `frontend/src/ui/`、`styles/`、`locales/` | Element Plus 按需注册、公共样式和英文翻译 |
| `backend/src/` | NestJS 模块：families、persons、relations、graph、validation、database、health；common 为公共类型与校验 |
| `backend/src/database/` | SQLite 查询、事务和结构初始化 |
| `backend/scripts/` | 迁移入口、数据库检查和维护、备份恢复验证 |
| `frontend/test/`、`backend/test/` | Vitest / Vue Test Utils 与 Jest 测试 |
| `frontend/e2e/` | Python Playwright 浏览器回归测试 |
| `scripts/` | Windows 进程管理和只读服务检查 |
| `data/` | 实际数据库、完整备份和私有资料；不进 Git，但搬家必须携带，不能作为缓存清理 |
| `docker/` | 镜像构建、Compose 部署和 Docker 环境配置示例；构建忽略规则留在根目录 |

`family` 保存家谱，`person` 保存人物，`person_relation` 只记录 parent/spouse；子女、兄妹视图由关系推导。`auto_parent_exclusion` 保存自动家长排除，`review_confirmation` 保存校对确认，SQLite `user_version` 记录结构版本，`archive_postgres_migrations` 保留原迁移记录。

API 统一以 `/api` 开头，主要入口为 `/families`、`/families/import`、`/families/:id/export`、`/persons/search`、`/persons/:id`、`/relations`、`/graph/person/:id`、`/graph/relationship-path`、`/graph/tree`、`/graph/tree-path` 和 `/validation/anomalies`。准确参数与方法以各模块 controller 和 [前端 API 定义](frontend/src/api.ts) 为准。

## 验证与维护

Windows 进程管理的隔离回归检查：`powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-process-safety.ps1`，使用模拟进程，不启停真实服务或数据库。

在两端各执行：

```powershell
npm run lint
npm run typecheck
npm test
npm run build
```

后端另有 `npm run format:check` 和构建后运行的 `npm run test:integration`；集成检查使用独立内存 SQLite、合成记录与回滚事务，不连接真实数据库。格式化命令为 `npm run format`。

前端构建后，在 `frontend/` 执行：

```powershell
python -m pip install -r e2e/requirements.txt
python -m playwright install chromium
npm run test:e2e
```

Python 3.12+ 只用于浏览器测试，不是应用运行依赖。Windows 可先设置 `$env:BROWSER_CHANNEL='msedge'` 使用已安装的 Edge，省去 Chromium 下载。测试自动启停 4173 端口预览服务，拦截 API 使用虚构数据，覆盖查找、径向路径、全屏弹层、SVG/JSON 下载、确认框、中英切换和窄屏表单间距。

服务启动后，可从根目录执行只读检查：

```powershell
powershell -ExecutionPolicy Bypass -File ./scripts/acceptance_smoke.ps1
```

较大改动后，用独立测试家谱验收搜索分页、原位编辑、亲属增删、自动家长调整、校对确认、树形/径向查找与展开、全屏，以及 JSON 往返恢复；同时检查中英、窄屏和空状态。真实家谱用于只读展示验证，写入测试不使用真实档案。

项目不配置 GitHub 自动检查，维护时手动执行上述验证命令。极端大树性能仍需按形状及设备评估，不保证任意人数实时渲染；原始影像查看、自动合并同名人物和通用修改历史尚未实现。

### 自动家长维护

- `backend/scripts/sync-single-spouse-parents.js`：后端构建并迁移后，从 backend 运行 `node scripts/sync-single-spouse-parents.js` 只检查候选；加 `--apply --backup-dir <新的备份目录>` 才执行。修改前验证完整 SQLite 备份并逐谱备份，所有家谱在一个事务内协调。

## 协作与许可

修改应聚焦具体行为，按涉及范围验证；接口和格式变更同步 README，业务约束同步 AGENTS。不要提交 node_modules、dist、环境配置、日志或真实家谱。漏洞通过仓库托管平台的私密安全通道报告，不在公开 issue 中发布凭据和私人数据。

安全修复面向主分支的最新版本；漏洞细节通过私密通道报告，避免在公开 issue 中披露可利用细节。

采用 Apache License 2.0，见 [LICENSE](LICENSE) 和 [NOTICE](NOTICE)。
