# Chroma 本地向量服务

本目录用于在本项目中独立启动 Chroma 向量数据库服务。NestJS 后端只通过 `chromadb` Node 客户端连接 Chroma；真正的向量数据由这里启动的 Chroma 服务保存。

## 一次性安装

在项目根目录执行：

```powershell
cd server
npm.cmd run chroma:install
```

脚本会在 `chroma-server/.venv` 创建 Python 虚拟环境，并安装 `requirements.txt` 中的 Chroma 服务端依赖。

## 启动服务

在项目根目录执行：

```powershell
cd server
npm.cmd run chroma:start
```

默认启动地址：

```text
http://localhost:8000
```

默认持久化目录：

```text
D:\AllProjects\FullstackSeed\chroma-data
```

该目录已加入根目录 `.gitignore`，只作为本机运行数据，不提交到代码仓库。

## 与后端配置对应

后端默认通过以下配置连接 Chroma：

```text
CHROMA_URL=http://localhost:8000
CHROMA_COLLECTION=knowledge_chunks
CHROMA_TENANT=default_tenant
CHROMA_DATABASE=default_database
```

后台「向量化配置」页面中如果启用了配置，会优先使用后台配置；没有启用配置时，后端才回退读取环境变量。

## 可选环境变量

启动脚本支持覆盖监听地址和端口：

```powershell
$env:CHROMA_HOST = "localhost"
$env:CHROMA_PORT = "8000"
npm.cmd run chroma:start
```
