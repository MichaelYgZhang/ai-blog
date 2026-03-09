const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');
const https = require('https');

// DeepSeek API (OpenAI 兼容接口)
const openai = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: 'https://api.deepseek.com'
});

const INDEX_PATH = path.join(__dirname, '../index.html');
const ROADMAP_PATH = path.join(__dirname, '../roadmap.html');

// ============================================================
// 工具函数
// ============================================================

function getBeijingDate() {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }));
  return now;
}

// 带重试的 API 调用
async function callWithRetry(fn, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error) {
      console.error(`  ⚠️ 第${i + 1}次调用失败: ${error.message}`);
      if (i === retries - 1) throw error;
      const delay = (i + 1) * 5000;
      console.log(`  ⏳ ${delay / 1000}秒后重试...`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

// 简易 HTTPS GET（不依赖 node-fetch）
function httpsGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'ai-blog-weekly-update', ...headers } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return httpsGet(res.headers.location, headers).then(resolve, reject);
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ status: res.statusCode, data });
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data.substring(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Request timeout')); });
  });
}

// 解析 AI 返回的 JSON
function parseJSON(content) {
  content = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  try {
    return JSON.parse(content);
  } catch (e) {
    const match = content.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error('无法解析JSON: ' + content.substring(0, 300));
  }
}

// ============================================================
// Step 1: 更新 GitHub Star 数
// ============================================================

async function updateStarCounts(html) {
  console.log('\n⭐ Step 1: 更新 GitHub Star 数...');

  // 匹配 <a href="https://github.com/{owner}/{repo}" ... class="content-card"> 中包含 ⭐ 的卡片
  const cardRegex = /<a\s+href="https:\/\/github\.com\/([^"]+)"\s+target="_blank"\s+class="content-card">([\s\S]*?)<\/a>/g;
  const starRegex = /<span>⭐\s*[\d.]+k\+<\/span>/;

  const repos = [];
  let match;
  while ((match = cardRegex.exec(html)) !== null) {
    const repoPath = match[1];
    const cardContent = match[2];
    if (starRegex.test(cardContent)) {
      repos.push(repoPath);
    }
  }

  console.log(`  找到 ${repos.length} 个 GitHub 仓库需要更新 star 数`);

  const starMap = {};
  const githubToken = process.env.GITHUB_TOKEN || '';

  for (const repo of repos) {
    try {
      const headers = {};
      if (githubToken) {
        headers['Authorization'] = `token ${githubToken}`;
      }
      const url = `https://api.github.com/repos/${repo}`;
      const res = await httpsGet(url, headers);
      const data = JSON.parse(res.data);
      const stars = data.stargazers_count;
      // 格式化为 xxk+
      let formatted;
      if (stars >= 1000) {
        formatted = Math.floor(stars / 1000) + 'k+';
      } else {
        formatted = stars + '';
      }
      starMap[repo] = formatted;
      console.log(`  ✅ ${repo}: ${formatted} (${stars})`);
    } catch (err) {
      console.warn(`  ❌ ${repo}: ${err.message}`);
    }
    // 避免 GitHub API rate limit
    await new Promise(r => setTimeout(r, 800));
  }

  // 替换 HTML 中的 star 数
  let updatedCount = 0;
  for (const [repo, starStr] of Object.entries(starMap)) {
    // 匹配该仓库卡片内的 ⭐ xxk+ 文本
    const escapedRepo = repo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(
      `(<a\\s+href="https:\\/\\/github\\.com\\/${escapedRepo}"\\s+target="_blank"\\s+class="content-card">[\\s\\S]*?<span>⭐\\s*)([\\d.]+k\\+)(\\s*<\\/span>)`,
    );
    if (pattern.test(html)) {
      html = html.replace(pattern, `$1${starStr}$3`);
      updatedCount++;
    }
  }

  console.log(`  📊 成功更新 ${updatedCount} 个仓库的 star 数`);
  return html;
}

// ============================================================
// Step 2: AI 内容审查与更新
// ============================================================

async function aiContentReview(indexHtml, roadmapHtml) {
  console.log('\n🤖 Step 2: AI 内容审查与更新...');

  // 提取关键内容摘要发给 AI
  const resourceSummary = extractResourceSummary(indexHtml);
  const roadmapSummary = extractRoadmapSummary(roadmapHtml);
  const now = getBeijingDate();
  const dateStr = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日`;

  const prompt = `你是一个AI学习资源专家。现在是${dateStr}。

以下是一个"AI研发进阶之路"学习指南网站的当前资源列表和路线图内容。请审查并给出更新建议。

## 当前资源列表
${resourceSummary}

## 当前路线图技能
${roadmapSummary}

请按以下JSON格式返回更新建议：

{
  "defaultNews": {
    "llm": [
      { "title": "新闻标题（不超过25字）", "hot": true/false, "url": "来源链接", "source": "来源名称", "date": "YYYY-MM-DD" }
    ],
    "coding": [...],
    "apps": [...],
    "industry": [...],
    "research": [...]
  },
  "roadmapUpdates": [
    {
      "stage": "阶段名称（如：大模型应用开发）",
      "addSkills": ["新增技能名"],
      "removeSkills": ["移除技能名"],
      "reason": "原因"
    }
  ],
  "summary": "本次审查的简要总结（2-3句话）"
}

要求：
1. defaultNews: 为每个分类生成3条当前最新的AI新闻作为页面默认展示，标记1条热门(hot:true)
2. 每条新闻必须提供来源链接(url)、来源名称(source)和发布日期(date)
3. url填写官方链接或权威媒体报道链接，不确定的填空字符串""
4. source填写信息来源名称（如"OpenAI官方博客"、"arXiv"、"TechCrunch"等）
5. roadmapUpdates: 只在确实有过时或缺失的重要技能时才建议修改，每个阶段最多增删1个技能，保持总数不变。如果不需要改动，返回空数组
6. 保持保守——不确定的不要改
7. 只返回JSON，不要其他内容`;

  const completion = await callWithRetry(() => openai.chat.completions.create({
    model: 'deepseek-chat',
    messages: [
      { role: 'system', content: '你是一个AI行业资源审查专家，只返回JSON格式数据。' },
      { role: 'user', content: prompt }
    ],
    temperature: 0.3,
    max_tokens: 3000
  }));

  const result = parseJSON(completion.choices[0].message.content);
  console.log(`  📝 AI审查完成: ${result.summary || '(无摘要)'}`);
  return result;
}

function extractResourceSummary(html) {
  const sections = [];

  // 提取开源实战项目
  const projectCards = [];
  const cardRegex = /<a\s+href="([^"]+)"\s+target="_blank"\s+class="content-card">\s*<div class="card-header">\s*<div class="card-icon">[^<]*<\/div>\s*<div class="card-title">([^<]+)<\/div>/g;
  let m;
  while ((m = cardRegex.exec(html)) !== null) {
    projectCards.push(`- ${m[2]} (${m[1]})`);
  }
  sections.push('### 所有资源卡片\n' + projectCards.join('\n'));

  // 提取统计数字
  const statsRegex = /<div class="stat-value">([^<]+)<\/div>\s*<div class="stat-label">([^<]+)<\/div>/g;
  const stats = [];
  while ((m = statsRegex.exec(html)) !== null) {
    stats.push(`- ${m[2]}: ${m[1]}`);
  }
  sections.push('### 统计数字\n' + stats.join('\n'));

  // 提取默认新闻
  const newsMatch = html.match(/const defaultData = \{([\s\S]*?)\};/);
  if (newsMatch) {
    sections.push('### 当前默认新闻数据\n' + newsMatch[0].substring(0, 500));
  }

  return sections.join('\n\n');
}

function extractRoadmapSummary(html) {
  const stages = [];
  const stageRegex = /<h3 class="stage-title">([^<]+)<\/h3>[\s\S]*?<div class="skills">([\s\S]*?)<\/div>/g;
  let m;
  while ((m = stageRegex.exec(html)) !== null) {
    const title = m[1];
    const skillsHtml = m[2];
    const skills = [];
    const skillRegex = /<span class="skill">([^<]+)<\/span>/g;
    let s;
    while ((s = skillRegex.exec(skillsHtml)) !== null) {
      skills.push(s[1]);
    }
    stages.push(`- ${title}: ${skills.join(', ')}`);
  }
  return stages.join('\n');
}

// 应用 AI 建议到 HTML
function applyAIUpdates(indexHtml, roadmapHtml, aiResult) {
  console.log('\n📝 应用 AI 更新建议...');

  // 1. 更新默认新闻 fallback 数据
  if (aiResult.defaultNews) {
    indexHtml = updateDefaultNews(indexHtml, aiResult.defaultNews);
  }

  // 2. 更新路线图技能
  if (aiResult.roadmapUpdates && aiResult.roadmapUpdates.length > 0) {
    roadmapHtml = updateRoadmapSkills(roadmapHtml, aiResult.roadmapUpdates);
  }

  return { indexHtml, roadmapHtml };
}

function updateDefaultNews(html, newsData) {
  // 重新生成 defaultData 对象
  const categories = ['llm', 'coding', 'apps', 'industry', 'research'];
  const lines = [];
  for (const cat of categories) {
    const items = (newsData[cat] || []).slice(0, 3);
    const itemLines = items.map(item => {
      const hot = item.hot ? ', hot: true' : '';
      // 转义 JS 字符串中的危险字符
      const safeTitle = item.title
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'")
        .replace(/\n/g, ' ')
        .replace(/<\//g, '<\\/');
      const urlPart = item.url ? `, url: '${item.url.replace(/'/g, "\\'")}'` : '';
      const sourcePart = item.source ? `, source: '${item.source.replace(/'/g, "\\'")}'` : '';
      const datePart = item.date ? `, date: '${item.date}'` : '';
      return `                    { title: '${safeTitle}'${hot}${urlPart}${sourcePart}${datePart} }`;
    });
    lines.push(`                ${cat}: [\n${itemLines.join(',\n')}\n                ]`);
  }
  const newDefault = lines.join(',\n');

  // 替换 defaultData 对象的内容（从 { 到对应的 }）
  const pattern = /(const defaultData = \{)\s*\n([\s\S]*?)\n\s*(\};)/;
  if (pattern.test(html)) {
    html = html.replace(pattern, `$1\n${newDefault}\n            $3`);
    console.log('  ✅ 默认新闻数据已更新');
  } else {
    console.warn('  ⚠️ 未能匹配默认新闻数据位置');
  }

  return html;
}

function updateRoadmapSkills(html, updates) {
  for (const update of updates) {
    if (!update.stage) continue;

    // 查找对应阶段
    const stagePattern = new RegExp(
      `(<h3 class="stage-title">${escapeRegex(update.stage)}<\\/h3>[\\s\\S]*?<div class="skills">)([\\s\\S]*?)(<\\/div>\\s*<div class="milestone">)`,
    );
    const match = html.match(stagePattern);
    if (!match) {
      console.warn(`  ⚠️ 未找到阶段: ${update.stage}`);
      continue;
    }

    let skillsHtml = match[2];

    // 删除技能
    if (update.removeSkills) {
      for (const skill of update.removeSkills) {
        const skillPattern = new RegExp(`\\s*<span class="skill">${escapeRegex(skill)}<\\/span>`);
        skillsHtml = skillsHtml.replace(skillPattern, '');
      }
    }

    // 添加技能
    if (update.addSkills) {
      for (const skill of update.addSkills) {
        // 避免重复
        if (!skillsHtml.includes(`>${skill}<`)) {
          skillsHtml = skillsHtml.trimEnd() + `\n                        <span class="skill">${skill}</span>`;
        }
      }
    }

    html = html.replace(stagePattern, `${match[1]}${skillsHtml}${match[3]}`);
    console.log(`  ✅ 路线图更新: ${update.stage} - ${update.reason || ''}`);
  }
  return html;
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ============================================================
// Step 3: 固定数据更新
// ============================================================

function updateFixedData(html) {
  console.log('\n🔧 Step 3: 更新固定数据...');

  const now = getBeijingDate();
  const year = now.getFullYear();

  // 1. 更新页脚年份
  const footerPattern = /© \d{4} AI研发进阶之路/;
  if (footerPattern.test(html)) {
    html = html.replace(footerPattern, `© ${year} AI研发进阶之路`);
    console.log(`  ✅ 页脚年份已更新为 ${year}`);
  }

  // 2. 统计数字更新 — 根据实际卡片数量计算
  const contentCards = (html.match(/class="content-card"/g) || []).length;
  const sections = (html.match(/class="section-header"/g) || []).length;

  // 计算实战项目数（projects tab 中的卡片数）
  const projectsMatch = html.match(/<div id="projects" class="tab-panel">([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>\s*<!-- Tab Panel/);
  const projectCards = projectsMatch ? (projectsMatch[1].match(/class="content-card"/g) || []).length : 0;

  // 更新统计数字
  // 学习专题 = sections 数
  html = updateStatValue(html, '学习专题', String(sections));
  // 实战项目 = projects tab 中的卡片数
  html = updateStatValue(html, '实战项目', String(projectCards));
  // 技术文章 = 所有资源卡片数 (近似)
  html = updateStatValue(html, '技术文章', String(contentCards));

  console.log(`  📊 统计: 学习专题=${sections}, 实战项目=${projectCards}, 技术文章=${contentCards}`);

  return html;
}

function updateStatValue(html, label, value) {
  const pattern = new RegExp(
    `(<div class="stat-value">)[^<]+(</div>\\s*<div class="stat-label">${escapeRegex(label)}</div>)`
  );
  return html.replace(pattern, `$1${value}$2`);
}

// ============================================================
// 主函数
// ============================================================

async function main() {
  const now = getBeijingDate();
  console.log(`📅 每周内容更新 - ${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日`);
  console.log('='.repeat(50));

  let indexHtml = fs.readFileSync(INDEX_PATH, 'utf-8');
  let roadmapHtml = fs.readFileSync(ROADMAP_PATH, 'utf-8');

  const originalIndex = indexHtml;
  const originalRoadmap = roadmapHtml;

  try {
    // Step 1: GitHub Star 数更新
    indexHtml = await updateStarCounts(indexHtml);

    // Step 2: AI 内容审查
    const aiResult = await aiContentReview(indexHtml, roadmapHtml);
    const updated = applyAIUpdates(indexHtml, roadmapHtml, aiResult);
    indexHtml = updated.indexHtml;
    roadmapHtml = updated.roadmapHtml;

    // Step 3: 固定数据更新
    indexHtml = updateFixedData(indexHtml);

    // 写回文件
    const indexChanged = indexHtml !== originalIndex;
    const roadmapChanged = roadmapHtml !== originalRoadmap;

    if (indexChanged) {
      fs.writeFileSync(INDEX_PATH, indexHtml, 'utf-8');
      console.log('\n✅ index.html 已更新');
    } else {
      console.log('\nℹ️ index.html 无变化');
    }

    if (roadmapChanged) {
      fs.writeFileSync(ROADMAP_PATH, roadmapHtml, 'utf-8');
      console.log('✅ roadmap.html 已更新');
    } else {
      console.log('ℹ️ roadmap.html 无变化');
    }

    console.log('\n🎉 每周更新完成!');

  } catch (error) {
    console.error('\n❌ 更新失败:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
