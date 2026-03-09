const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');

// 支持 DeepSeek API (兼容OpenAI接口)
const openai = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: 'https://api.deepseek.com'
});

// 阶段配置
const STAGES = {
  6: { name: '前沿探索与创新', color: '#ec4899' },
  5: { name: 'AI工程化与系统', color: '#8b5cf6' },
  4: { name: '大模型应用开发', color: '#3b82f6' },
  3: { name: '深度学习精通', color: '#10b981' },
  2: { name: '机器学习核心', color: '#f59e0b' },
  1: { name: '编程与数学基础', color: '#6366f1' }
};

// 获取日期信息（使用北京时间）
function getDateInfo() {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }));
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');

  return {
    year,
    month,
    day,
    dateStr: `${year}-${month}-${day}`,
    localeDateStr: now.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' }),
    updateTime: `${year}-${month}-${day} 08:00`
  };
}

// 带重试的API调用
async function callWithRetry(fn, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error) {
      console.error(`⚠️ 第${i + 1}次调用失败: ${error.message}`);
      if (i === retries - 1) throw error;
      const delay = (i + 1) * 5000;
      console.log(`⏳ ${delay / 1000}秒后重试...`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

// 读取课程大纲
function loadSyllabus() {
  const syllabusPath = path.join(__dirname, '../data/article-syllabus.json');
  return JSON.parse(fs.readFileSync(syllabusPath, 'utf-8'));
}

// 保存课程大纲
function saveSyllabus(syllabus) {
  const syllabusPath = path.join(__dirname, '../data/article-syllabus.json');
  fs.writeFileSync(syllabusPath, JSON.stringify(syllabus, null, 2), 'utf-8');
}

// 找到下一篇待发布的文章
function findNextArticle(syllabus) {
  return syllabus.find(article => article.status === 'pending');
}

// 找到下下篇文章（用于预告）
function findPreviewArticle(syllabus, currentId) {
  let found = false;
  for (const article of syllabus) {
    if (article.id === currentId) { found = true; continue; }
    if (found && article.status === 'pending') return article;
  }
  return null;
}

// 计算进度
function getProgress(syllabus) {
  const completed = syllabus.filter(a => a.status === 'published').length;
  return { completed: completed + 1, total: syllabus.length }; // +1 包含当前正在生成的
}

// 生成文章内容
async function generateArticle(article, dateInfo) {
  const stage = STAGES[article.stage];
  const depsDesc = article.dependencies.map(d =>
    `- 阶段${d.stageId}「${STAGES[d.stageId].name}」中的「${d.topic}」`
  ).join('\n');

  const prompt = `你是一位资深AI工程师和技术写作专家。请为以下主题撰写一篇深度学习文章。

## 文章信息
- 标题：${article.title}
- 所属阶段：阶段${article.stage}「${stage.name}」
- 核心技术点：${article.techPoints.join('、')}
${depsDesc ? `- 知识依赖：\n${depsDesc}` : ''}

## 写作要求

请按照**金字塔原理**组织文章，结构如下：

1. **核心结论**（开篇一句话说明本文最关键的结论/洞察）
2. **为什么重要**（2-3段，说明这个主题在AI工程师成长中的位置，它解决什么问题）
3. **核心内容**（文章主体，按技术点展开，每个技术点包含：概念说明→原理解析→代码示例或实践指导）
4. **知识依赖说明**（说明理解本文需要的前置知识，引导读者了解底层依赖）
5. **实践建议**（3-5条可立即执行的行动建议）
6. **延伸阅读**（推荐2-3个相关资源）

## 格式要求
- 使用Markdown格式
- 代码示例用Python/PyTorch
- 标题使用##和###
- 重要内容加粗
- 总字数2000-3000字
- 直接输出Markdown内容，不要包含任何开场白或解释性文字`;

  const completion = await callWithRetry(() => openai.chat.completions.create({
    model: "deepseek-chat",
    messages: [
      { role: "system", content: "你是一位资深AI工程师，擅长用金字塔原理撰写技术文章。直接输出Markdown格式的文章内容。" },
      { role: "user", content: prompt }
    ],
    temperature: 0.7,
    max_tokens: 4000
  }));

  return completion.choices[0].message.content;
}

// 生成文章摘要
async function generateSummary(article, fullContent) {
  const prompt = `请为以下文章生成一个80字以内的中文摘要，要求精炼概括文章核心内容和价值。直接输出摘要文字，不要加引号或其他修饰。

文章标题：${article.title}
技术点：${article.techPoints.join('、')}

文章内容：
${fullContent.substring(0, 1500)}`;

  const completion = await callWithRetry(() => openai.chat.completions.create({
    model: "deepseek-chat",
    messages: [
      { role: "system", content: "你是一个技术内容摘要专家。直接输出摘要文字。" },
      { role: "user", content: prompt }
    ],
    temperature: 0.3,
    max_tokens: 200
  }));

  return completion.choices[0].message.content.trim();
}

// 保存文章Markdown到归档
function saveArticleMarkdown(dateInfo, article, fullContent) {
  const stage = STAGES[article.stage];
  let md = `# ${article.title}\n\n`;
  md += `> 📖 每日AI学习 · 阶段${article.stage}「${stage.name}」\n`;
  md += `> 📅 ${dateInfo.localeDateStr} · 文章编号 ${article.id}\n\n`;
  md += `**核心技术点：** ${article.techPoints.join(' · ')}\n\n`;
  md += `---\n\n`;
  md += fullContent;
  md += `\n\n---\n\n[返回首页](../../index.html) | [查看全部文章](../../archives.html)\n`;

  const filePath = path.join(__dirname, `../archives/articles/${dateInfo.dateStr}-article.md`);
  fs.writeFileSync(filePath, md, 'utf-8');

  return `archives/articles/${dateInfo.dateStr}-article.md`;
}

// 更新归档索引
function updateArchiveIndex(dateInfo, article, fullArticleUrl) {
  const indexPath = path.join(__dirname, '../data/archives-index.json');
  let index = { daily: [], weekly: [], monthly: [], quarterly: [], articles: [] };

  if (fs.existsSync(indexPath)) {
    index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
    if (!index.articles) index.articles = [];
  }

  const stage = STAGES[article.stage];
  const entry = {
    date: dateInfo.dateStr,
    title: article.title,
    articleId: article.id,
    stage: article.stage,
    stageName: stage.name,
    url: fullArticleUrl
  };

  // 避免重复
  if (!index.articles.some(item => item.date === entry.date)) {
    index.articles.unshift(entry);
    index.articles = index.articles.slice(0, 120);
  }

  fs.writeFileSync(indexPath, JSON.stringify(index, null, 2), 'utf-8');
}

// 主函数
async function main() {
  const dateInfo = getDateInfo();
  console.log(`📅 日期: ${dateInfo.localeDateStr}`);

  try {
    // 1. 读取课程大纲
    const syllabus = loadSyllabus();
    console.log(`📚 课程大纲已加载，共 ${syllabus.length} 篇文章`);

    // 2. 找到下一篇待发布的文章
    const nextArticle = findNextArticle(syllabus);
    if (!nextArticle) {
      console.log('🎉 所有文章已发布完成！');
      return;
    }

    const stage = STAGES[nextArticle.stage];
    console.log(`📖 准备生成: [${nextArticle.id}] ${nextArticle.title}`);
    console.log(`   阶段${nextArticle.stage}: ${stage.name}`);

    // 3. 生成文章内容
    console.log('✍️ 正在生成文章内容...');
    const fullContent = await generateArticle(nextArticle, dateInfo);
    console.log('✅ 文章内容已生成');

    // 4. 生成摘要
    console.log('📝 正在生成摘要...');
    const summary = await generateSummary(nextArticle, fullContent);
    console.log(`✅ 摘要: ${summary}`);

    // 5. 保存Markdown归档
    const articlesDir = path.join(__dirname, '../archives/articles');
    if (!fs.existsSync(articlesDir)) {
      fs.mkdirSync(articlesDir, { recursive: true });
    }
    const fullArticleUrl = saveArticleMarkdown(dateInfo, nextArticle, fullContent);
    console.log(`✅ 文章已保存: ${fullArticleUrl}`);

    // 6. 计算进度和预告
    const progress = getProgress(syllabus);
    const previewArticle = findPreviewArticle(syllabus, nextArticle.id);

    // 7. 生成 latest-article.json
    const latestArticle = {
      date: dateInfo.localeDateStr,
      updateTime: dateInfo.updateTime,
      articleId: nextArticle.id,
      title: nextArticle.title,
      summary: summary,
      stage: {
        id: nextArticle.stage,
        name: stage.name,
        color: stage.color
      },
      techPoints: nextArticle.techPoints,
      dependencies: nextArticle.dependencies.map(d => ({
        stageName: STAGES[d.stageId].name,
        stageId: d.stageId,
        topic: d.topic,
        reason: `理解「${nextArticle.title}」需要掌握「${d.topic}」的相关知识`
      })),
      nextPreview: previewArticle ? {
        title: previewArticle.title,
        teaser: `下一篇将探讨${previewArticle.techPoints.slice(0, 2).join('和')}等技术要点`
      } : null,
      progress: progress,
      fullArticleUrl: fullArticleUrl
    };

    const latestPath = path.join(__dirname, '../data/latest-article.json');
    fs.writeFileSync(latestPath, JSON.stringify(latestArticle, null, 2), 'utf-8');
    console.log('✅ latest-article.json 已更新');

    // 8. 更新归档索引
    updateArchiveIndex(dateInfo, nextArticle, fullArticleUrl);
    console.log('✅ archives-index.json 已更新');

    // 9. 标记文章为已发布
    const idx = syllabus.findIndex(a => a.id === nextArticle.id);
    syllabus[idx].status = 'published';
    syllabus[idx].publishDate = dateInfo.dateStr;
    saveSyllabus(syllabus);
    console.log(`✅ 文章 ${nextArticle.id} 已标记为 published`);

    console.log(`\n🎉 今日文章发布完成！进度: ${progress.completed}/${progress.total}`);

  } catch (error) {
    console.error('❌ 生成失败:', error.message);
    process.exit(1);
  }
}

main();
