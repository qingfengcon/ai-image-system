# AI图片处理系统 - 部署手册

## 1. 系统要求

| 项目 | 最低要求 |
|------|---------|
| 操作系统 | Windows 7+ / Linux / macOS |
| Node.js | 16.x 及以上 |
| 内存 | 512MB 及以上 |
| 磁盘 | 100MB 及以上（不含上传文件） |
| 网络 | 需要访问 api.wavespeed.ai |

## 2. 快速部署（一键部署）

### Windows

双击运行 `deploy.bat`，脚本将自动完成以下操作：
1. 检查 Node.js 环境
2. 检查项目文件完整性
3. 安装 npm 依赖
4. 创建必要目录（data、uploads）
5. 生成默认 .env 配置文件
6. 配置 Windows 防火墙规则
7. 提示启动系统

### Linux / macOS

```bash
# 安装依赖
npm install

# 创建目录
mkdir -p data uploads

# 创建配置文件（首次部署）
cp .env.example .env  # 或手动创建

# 启动系统
npm start
```

## 3. 手动部署步骤

### 3.1 安装 Node.js

前往 https://nodejs.org/ 下载并安装 LTS 版本。

验证安装：
```bash
node --version   # 应显示 v16.x.x 或更高
npm --version    # 应显示 8.x.x 或更高
```

### 3.2 获取项目代码

```bash
git clone https://github.com/qingfengcon/ai-image-system.git
cd ai-image-system
```

### 3.3 安装依赖

```bash
npm install
```

### 3.4 配置环境变量

编辑项目根目录下的 `.env` 文件：

```env
# WaveSpeed API Key（必填，在系统设置中也可修改）
WAVESPEED_API_KEY=your_wavespeed_api_key_here

# JWT 密钥（建议修改为随机字符串）
JWT_SECRET=ai-image-system-secret-key-2024

# 服务端口
PORT=3000
```

获取 WaveSpeed API Key：
1. 访问 https://wavespeed.ai/ 注册账号
2. 进入 Dashboard → API Keys 页面
3. 创建新的 API Key 并复制到配置中

### 3.5 启动系统

```bash
npm start
```

启动成功后会显示：
```
数据库初始化完成
服务器运行在 http://localhost:3000
局域网访问: http://<本机IP>:3000
默认管理员账号: admin / admin123
```

## 4. 局域网访问配置

系统默认监听 `0.0.0.0`，支持局域网访问。

### 4.1 获取本机局域网 IP

**Windows：**
```bash
ipconfig | findstr IPv4
```

**Linux/macOS：**
```bash
ifconfig | grep inet
# 或
hostname -I
```

### 4.2 防火墙配置

**Windows（管理员权限运行）：**
```bash
netsh advfirewall firewall add rule name="AI图片处理系统" dir=in action=allow protocol=TCP localport=3000
```

**Linux（ufw）：**
```bash
sudo ufw allow 3000/tcp
```

**Linux（firewalld）：**
```bash
sudo firewall-cmd --permanent --add-port=3000/tcp
sudo firewall-cmd --reload
```

### 4.3 访问地址

局域网内其他设备通过浏览器访问：`http://<服务器IP>:3000`

## 5. 生产环境部署建议

### 5.1 使用 PM2 进程守护

```bash
# 安装 PM2
npm install -g pm2

# 启动服务
pm2 start server.js --name ai-image-system

# 设置开机自启
pm2 startup
pm2 save

# 常用命令
pm2 status          # 查看状态
pm2 logs            # 查看日志
pm2 restart ai-image-system   # 重启
pm2 stop ai-image-system      # 停止
```

### 5.2 修改默认密码

首次登录后请立即修改管理员密码：
1. 使用 `admin / admin123` 登录
2. 进入个人设置修改密码

### 5.3 修改 JWT 密钥

编辑 `.env` 文件，将 `JWT_SECRET` 修改为随机长字符串：

```bash
# 生成随机密钥（Linux/macOS）
openssl rand -hex 32

# 或使用 Node.js 生成
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 5.4 数据备份

系统数据存储在 `data/database.sqlite` 文件中，定期备份此文件即可：

```bash
# 手动备份
cp data/database.sqlite data/database.sqlite.bak

# 定时备份（Linux crontab，每天凌晨3点）
0 3 * * * cp /path/to/ai-image-system/data/database.sqlite /path/to/backup/database-$(date +\%Y\%m\%d).sqlite
```

### 5.5 Nginx 反向代理（可选）

如需使用域名或 HTTPS 访问：

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        client_max_body_size 50M;  # 允许上传大图片
    }
}
```

## 6. 项目目录结构

```
ai-image-system/
├── server.js           # 主入口文件
├── config.js           # 配置文件
├── package.json        # 项目依赖
├── .env                # 环境变量（不纳入版本控制）
├── deploy.bat          # 一键部署脚本（Windows）
├── db/
│   ├── database.js     # 数据库操作模块
│   └── init.js         # 数据库初始化
├── middleware/
│   └── auth.js         # JWT 认证中间件
├── routes/
│   ├── auth.js         # 用户认证路由
│   ├── tasks.js        # 任务管理路由
│   ├── stats.js        # 统计路由
│   └── settings.js     # 系统设置路由
├── services/
│   └── wavespeed.js    # WaveSpeed API 服务
├── public/
│   ├── index.html      # 前端页面
│   ├── css/style.css   # 样式文件
│   └── js/app.js       # 前端逻辑
├── data/               # 数据库文件（自动创建）
└── uploads/            # 上传文件（自动创建）
```

## 7. 常见问题

### Q: 启动报错 `EADDRINUSE`
端口 3000 被占用，修改 `.env` 中的 `PORT` 为其他端口，或关闭占用进程：
```bash
# Windows
netstat -ano | findstr :3000
taskkill /PID <进程ID> /F

# Linux
lsof -i :3000
kill <PID>
```

### Q: 局域网无法访问
1. 检查防火墙是否放行对应端口
2. 确认服务器和客户端在同一局域网
3. 确认服务器监听的是 `0.0.0.0` 而非 `127.0.0.1`

### Q: 任务一直显示"处理中"
1. 检查 WaveSpeed API Key 是否有效
2. 查看服务器日志中的 `[WaveSpeed]` 和 `[Poll]` 标签输出
3. 确认服务器能正常访问 api.wavespeed.ai

### Q: npm install 失败
1. 检查网络连接
2. 尝试切换 npm 镜像：`npm config set registry https://registry.npmmirror.com`
3. 清除缓存重试：`npm cache clean --force && npm install`

### Q: 数据库损坏
删除 `data/database.sqlite` 文件，重启系统会自动重新初始化（数据会丢失）。
