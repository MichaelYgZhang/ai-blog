# AI资讯模块功能增强文档

## 概述

本次增强实现了以下核心功能：

1. **时间约束强化**：严格限制为最近7天内的资讯（从原来的7-14天改为严格7天）
2. **智能去重机制**：7天内同一资讯只出现一次，基于URL和标题指纹去重
3. **GitHub Trending集成**：每周报告自动包含GitHub上最受关注的AI项目
4. **周报结构优化**：采用金字塔原理组织内容，先总览后展开

## 功能详解

### 1. 严格7天时间约束

**实现位置**：`scripts/generate-news.js` - `generateDailyNews()` 函数

**核心逻辑**：
```javascript
// 计算7天前的日期
const currentDate = new Date(dateInfo.year, parseInt(dateInfo.month) - 1, parseInt(dateInfo.day));
const sevenDaysAgo = new Date(currentDate);
sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
const minDateStr = `${sevenDaysAgo.getFullYear()}-${String(sevenDaysAgo.getMonth() + 1).padStart(2, '0')}-${String(sevenDaysAgo.getDate()).padStart(2, '0')}`;
```

**双重保障**：
- **Prompt约束**：在API调用中明确要求"最近7天"
- **代码验证**：返回数据后二次验证日期，过滤超期新闻

**效果**：
- 确保所有资讯都是最近7天内的真实动态
- 自动过滤超过7天的新闻，并输出警告日志

### 2. 智能去重机制

**实现文件**：`scripts/deduplication-manager.js`

**核心特性**：

#### 去重策略
- **优先URL去重**：如果新闻有URL，基于URL的MD5指纹去重
- **标题去重**：如果无URL，基于标准化标题的MD5指纹去重
- **标题标准化**：转小写、去除特殊字符、去除空格

#### 缓存管理
- **自动存储**：已发布新闻自动存入 `data/published-news-cache.json`
- **自动清理**：每次运行自动清理7天前的记录
- **持久化存储**：跨运行保持去重记忆

#### 指纹生成
```javascript
function generateFingerprint(newsItem) {
  if (newsItem.url && newsItem.url.trim() !== '') {
    return crypto.createHash('md5').update(newsItem.url.trim()).digest('hex');
  }
  const normalizedTitle = newsItem.title
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fa5]/g, '')
    .trim();
  return crypto.createHash('md5').update(normalizedTitle).digest('hex');
}
```

#### 使用示例
```javascript
const { deduplicateNews } = require('./deduplication-manager');

let newsData = await generateDailyNews(dateInfo);
newsData = deduplicateNews(newsData, dateInfo);
```

**效果**：
- 同一URL的新闻在7天内只出现一次
- 相同标题的新闻在7天内只出现一次
- 详细日志输出：去重前后的数量对比

### 3. GitHub Trending集成

**实现文件**：`scripts/github-trending.js`

**核心功能**：

#### 数据获取
- **爬取方式**：直接爬取GitHub Trending页面（无需API Key）
- **时间范围**：weekly（每周趋势）
- **支持语言**：可按编程语言过滤

#### AI项目筛选
**AI关键词列表**（部分）：
- ai, artificial-intelligence, machine-learning, deep-learning
- neural-network, nlp, computer-vision, llm, gpt, transformer
- pytorch, tensorflow, langchain, openai, claude, embedding, rag
- fine-tuning, model, chatbot, agent, diffusion...

**筛选规则**：
1. 项目名称或描述包含AI关键词
2. 或为AI常用语言（Python/Jupyter/Julia等）且高星项目（≥100 stars/week）

#### 周报集成
在周报生成时自动：
1. 获取本周GitHub Trending数据
2. 筛选出Top 10 AI相关项目
3. 插入到周报的"五、GitHub Trending AI项目"章节

**Markdown格式示例**：
```markdown
### 五、GitHub Trending AI项目

本周GitHub上最受关注的AI项目：

1. **[项目名](URL)** (语言)
   - 描述
   - ⭐ 总stars数 (+本周新增stars)
```

**降级处理**：
- GitHub Trending获取失败不影响周报生成
- 失败时会输出警告日志

### 4. 周报结构优化（金字塔原理）

**实现位置**：`scripts/generate-news.js` - `generateSummary()` 函数

**新的周报结构**：

```markdown
## 一、核心结论（总览）
[3-5句话总结本周最重要的核心洞察和趋势]

## 二、关键动态（展开）
### 1. 本周最重要的5-10条AI动态（按影响力排序）
[按影响力从高到低排序，而非时间顺序]

### 2. 分类汇总
#### 大模型动态
#### AI工具与应用
#### 行业动态
#### 研究进展

## 三、趋势洞察
[2-3个关键趋势，每个趋势需数据或案例支撑]

## 四、值得关注的项目或工具

### 五、GitHub Trending AI项目
[Top 10 AI项目]

## 信息来源
```

**关键改进**：
- **金字塔顶层**：先给出核心结论，让读者快速把握要点
- **影响力优先**：动态按影响力排序，而非时间顺序
- **数据支撑**：趋势洞察必须包含数据或案例
- **完整引用**：每条动态都标注来源和日期

## 文件结构

### 新增文件

```
scripts/
├── deduplication-manager.js   # 去重核心逻辑
└── github-trending.js          # GitHub Trending爬虫

data/
└── published-news-cache.json   # 去重缓存（自动生成）
```

### 修改文件

```
scripts/generate-news.js        # 主生成逻辑
├── 导入新模块
├── 修改generateDailyNews()
│   ├── 更新prompt：7-14天 → 7天
│   ├── 计算7天前日期
│   └── 添加日期验证过滤
├── 修改generateSummary()
│   ├── 优化prompt结构（金字塔原理）
│   └── 集成GitHub Trending
└── 修改main()
    └── 集成去重逻辑

package.json                    # 添加cheerio依赖
```

## 测试验证

### 单元测试

运行测试脚本：
```bash
node test-enhancements.js
```

测试内容：
- ✅ 日期过滤验证（7天限制）
- ✅ 去重功能验证
- ✅ 指纹生成测试
- ✅ 缓存清理测试

### GitHub Trending测试

运行测试脚本：
```bash
node test-github-trending.js
```

测试内容：
- ✅ GitHub Trending数据获取
- ✅ AI项目筛选
- ✅ 项目信息解析

### 集成测试

运行完整流程：
```bash
npm run update-news
```

检查点：
1. ✅ 生成的新闻日期都在7天内
2. ✅ `data/published-news-cache.json` 正确生成和更新
3. ✅ 运行两次，第二次有去重效果
4. ✅ 周报包含GitHub Trending章节（周日运行时）
5. ✅ 周报结构符合金字塔原理

## 使用说明

### 环境要求

- Node.js >= 14.0.0
- npm >= 6.0.0
- DEEPSEEK_API_KEY 环境变量

### 安装依赖

```bash
npm install
```

### 运行生成

```bash
npm run update-news
```

### 输出示例

```
📅 日期: 2026年3月11日
📰 生成每日AI快讯...
📁 llm: 过滤了 1 条超过7天的新闻
🔍 执行去重检查...
  🔄 去重: GPT-5发布...
  📁 llm: 5 → 4 (去除 1 条重复)
✅ 去重完成: 15 → 14 (共去除 1 条重复)
✅ daily-news.json 已更新
✅ archives/daily/2026-03-11-ai-daily.md 已保存
```

## 性能优化

### 去重缓存管理

- **自动清理**：每次运行清理7天前的记录
- **轻量存储**：仅存储指纹、标题、URL、日期、来源
- **快速查询**：基于内存的键值对查询

### GitHub Trending优化

- **超时控制**：15秒超时保护
- **失败降级**：获取失败不影响主流程
- **缓存友好**：可考虑添加本地缓存（未来优化）

## 潜在问题与应对

### 问题1：API返回的新闻日期不准确

**应对**：
- Prompt明确要求准确日期
- 代码二次验证日期
- 过滤超期新闻并输出警告

### 问题2：GitHub Trending爬虫被封

**应对**：
- 使用标准浏览器User-Agent
- 设置合理超时时间
- 失败时降级处理

### 问题3：去重缓存过大

**应对**：
- 每日自动清理过期记录
- 仅存储必要信息
- 可设置最大缓存条数（未来优化）

### 问题4：网络连接问题

**应对**：
- GitHub Trending失败不影响核心功能
- API调用有重试机制（3次）
- 详细的错误日志输出

## 未来优化方向

1. **多源数据**：除了GitHub Trending，可接入Hacker News、ProductHunt等
2. **智能分类**：使用AI自动分类新闻，提升准确性
3. **情感分析**：分析新闻情感倾向，识别重要程度
4. **个性化推荐**：基于用户偏好定制内容
5. **实时监控**：从定时生成改为实时监控和推送

## 技术栈

- **运行时**：Node.js
- **AI API**：DeepSeek API（兼容OpenAI接口）
- **HTML解析**：cheerio
- **加密**：crypto（MD5指纹）
- **文件系统**：fs、path

## 维护建议

1. **定期检查**：每周检查生成的周报质量
2. **监控日志**：关注过滤和去重的日志输出
3. **更新关键词**：根据AI领域发展更新GitHub Trending的AI关键词列表
4. **清理缓存**：定期检查 `published-news-cache.json` 大小
5. **API监控**：监控DeepSeek API调用成功率和延迟

## 总结

本次增强显著提升了AI资讯模块的质量和用户体验：

- ✅ **时效性**：严格7天限制确保内容新鲜
- ✅ **去重性**：智能去重避免信息重复
- ✅ **丰富性**：GitHub Trending增加技术趋势
- ✅ **可读性**：金字塔原理提升报告质量

所有功能已经过测试验证，可投入生产使用。
