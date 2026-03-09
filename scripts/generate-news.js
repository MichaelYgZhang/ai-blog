const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');

// 支持 DeepSeek API (兼容OpenAI接口)
const openai = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: 'https://api.deepseek.com'
});

// 获取日期信息（使用北京时间）
function getDateInfo() {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }));
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const weekDay = now.getDay();
  const quarter = Math.ceil((now.getMonth() + 1) / 3);

  return {
    year,
    month,
    day,
    dateStr: `${year}-${month}-${day}`,
    monthStr: `${year}-${month}`,
    quarterStr: `${year}-Q${quarter}`,
    weekDay,
    isEndOfWeek: weekDay === 0, // 周日
    isEndOfMonth: new Date(year, now.getMonth() + 1, 0).getDate() === parseInt(day),
    isEndOfQuarter: [3, 6, 9, 12].includes(now.getMonth() + 1) && new Date(year, now.getMonth() + 1, 0).getDate() === parseInt(day),
    localeDateStr: now.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' }),
    updateTime: `${year}-${month}-${day} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
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

// 生成每日快讯
async function generateDailyNews(dateInfo) {
  const prompt = `你是一个AI行业资讯专家。请生成今天(${dateInfo.localeDateStr})的AI领域最新资讯汇总。

请严格按照以下JSON格式返回，每个分类3-5条新闻：

{
  "llm": [
    { "title": "新闻标题", "url": "来源链接", "date": "YYYY-MM-DD", "source": "来源名称", "hot": true/false }
  ],
  "coding": [...],
  "apps": [...],
  "industry": [...],
  "research": [...]
}

分类说明：
- llm: 大语言模型相关（如GPT、Claude、Gemini、Llama等模型更新）
- coding: AI编程工具（如Cursor、Copilot、Devin等）
- apps: AI应用产品（如ChatGPT、Midjourney、各类AI工具）
- industry: AI行业动态（融资、市场、政策等）
- research: AI研究论文（arxiv上的重要论文、新架构等）

要求：
1. 所有新闻必须是最近7-14天内的真实动态，严禁使用超过14天的旧闻或已广泛报道过的历史事件
2. 每个分类标记1-2条热门新闻(hot: true)
3. 每条新闻必须提供来源链接(url)、来源名称(source)和发布日期(date)
4. url填写官方链接或权威媒体报道链接，不确定的填空字符串""
5. source填写信息来源名称（如"OpenAI官方博客"、"arXiv"、"TechCrunch"等）
6. date填写新闻发布日期，格式为YYYY-MM-DD，日期必须在最近14天内
7. 标题简洁有力，不超过30字
8. 只返回JSON，不要其他内容`;

  const completion = await callWithRetry(() => openai.chat.completions.create({
    model: "deepseek-chat",  // DeepSeek V3
    messages: [
      { role: "system", content: "你是一个AI行业资讯专家，只返回JSON格式数据。所有新闻必须是最近7-14天内发生的真实事件，绝不允许使用超过14天的旧闻。" },
      { role: "user", content: prompt }
    ],
    temperature: 0.7,
    max_tokens: 2000
  }));

  let content = completion.choices[0].message.content;
  content = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

  try {
    return JSON.parse(content);
  } catch (e) {
    // 尝试提取JSON部分
    const match = content.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error('无法解析API返回的JSON: ' + content.substring(0, 200));
  }
}

// 生成周报/月报/季报
async function generateSummary(type, dateInfo, recentNews) {
  const typeNames = { weekly: '周', monthly: '月', quarterly: '季度' };
  const typeName = typeNames[type];

  const prompt = `基于以下近期AI快讯内容，生成一份${typeName}度高价值内容汇总。当前日期: ${dateInfo.localeDateStr}。

${JSON.stringify(recentNews, null, 2)}

请生成Markdown格式的${typeName}报，包含：
1. 本${typeName}最重要的5-10条AI动态（按影响力排序）
2. 分类汇总（大模型/AI工具/行业动态/研究进展）
3. 趋势洞察（2-3个关键趋势）
4. 值得关注的项目或工具

重要：所有内容必须是最近7-14天内的真实动态，严禁包含超过14天的旧闻或历史事件。

格式要求：
- 使用中文
- 标题使用##
- 列表使用-
- 重要内容加粗
- 每条动态必须标注信息来源和日期，格式为：**标题** ([来源名称](来源链接), YYYY-MM-DD)
- 如果快讯数据中包含url、source、date字段，直接使用；如果没有，根据内容推断并标注
- 在报告末尾添加"## 信息来源"章节，汇总本报告引用的所有来源链接
- 直接输出Markdown内容，不要包含任何客套话、开场白或解释性文字`;

  const completion = await callWithRetry(() => openai.chat.completions.create({
    model: "deepseek-chat",  // DeepSeek V3
    messages: [
      { role: "system", content: "你是一个AI行业分析师，生成高质量的行业报告。" },
      { role: "user", content: prompt }
    ],
    temperature: 0.7,
    max_tokens: 3000
  }));

  return completion.choices[0].message.content;
}

// 保存每日Markdown文件
function saveDailyMarkdown(dateInfo, newsData) {
  const categoryNames = {
    llm: '🧠 大模型',
    coding: '💻 AI Coding',
    apps: '📱 AI应用',
    industry: '📊 AI行业',
    research: '📄 研究论文'
  };

  let md = `# AI快讯 ${dateInfo.localeDateStr}\n\n`;
  md += `> 更新时间: ${dateInfo.updateTime}\n\n`;

  Object.keys(categoryNames).forEach(key => {
    if (newsData[key] && newsData[key].length > 0) {
      md += `## ${categoryNames[key]}\n\n`;
      newsData[key].forEach(item => {
        const hot = item.hot ? ' 🔥' : '';
        const source = item.source ? ` - 来源: ${item.source}` : '';
        const date = item.date ? ` (${item.date})` : '';
        if (item.url) {
          md += `- [${item.title}](${item.url})${hot}${date}${source}\n`;
        } else {
          md += `- ${item.title}${hot}${date}${source}\n`;
        }
      });
      md += '\n';
    }
  });

  md += `---\n\n[返回首页](../index.html) | [查看归档](../archives.html)\n`;

  const filePath = path.join(__dirname, `../archives/daily/${dateInfo.dateStr}-ai-daily.md`);
  fs.writeFileSync(filePath, md, 'utf-8');

  return {
    date: dateInfo.dateStr,
    title: `AI快讯 ${dateInfo.localeDateStr}`,
    url: `archives/daily/${dateInfo.dateStr}-ai-daily.md`
  };
}

// 更新归档索引
function updateArchiveIndex(type, newEntry) {
  const indexPath = path.join(__dirname, '../data/archives-index.json');
  let index = { daily: [], weekly: [], monthly: [], quarterly: [] };

  if (fs.existsSync(indexPath)) {
    index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
  }

  // 避免重复
  if (!index[type].some(item => item.date === newEntry.date)) {
    index[type].unshift(newEntry);
    // 保留最近的记录
    const limits = { daily: 90, weekly: 52, monthly: 24, quarterly: 12 };
    index[type] = index[type].slice(0, limits[type]);
  }

  fs.writeFileSync(indexPath, JSON.stringify(index, null, 2), 'utf-8');
}

// 收集本周所有每日快讯数据
function collectWeeklyNews(dateInfo, todayNews) {
  const dailyDir = path.join(__dirname, '../archives/daily');
  const allNews = [];

  // 获取本周的日期范围（周一到周日）
  const now = new Date(dateInfo.year, parseInt(dateInfo.month) - 1, parseInt(dateInfo.day));
  const dayOfWeek = now.getDay() || 7; // 周日为7
  for (let offset = dayOfWeek - 1; offset >= 0; offset--) {
    const d = new Date(now);
    d.setDate(d.getDate() - offset);
    const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const mdPath = path.join(dailyDir, `${ds}-ai-daily.md`);

    // 尝试读取对应日期的JSON（仅当天的在data/目录下）
    if (ds === dateInfo.dateStr) {
      allNews.push({ date: ds, ...todayNews });
      continue;
    }

    // 尝试从归档Markdown中提取简要内容
    if (fs.existsSync(mdPath)) {
      try {
        const mdContent = fs.readFileSync(mdPath, 'utf-8');
        allNews.push({ date: ds, markdown: mdContent });
      } catch (e) {
        // 忽略读取失败
      }
    }
  }

  return allNews;
}

// 收集本月所有每日快讯数据
function collectMonthlyNews(dateInfo, todayNews) {
  const dailyDir = path.join(__dirname, '../archives/daily');
  const allNews = [];
  const daysInMonth = parseInt(dateInfo.day);

  for (let d = 1; d <= daysInMonth; d++) {
    const ds = `${dateInfo.year}-${dateInfo.month}-${String(d).padStart(2, '0')}`;
    const mdPath = path.join(dailyDir, `${ds}-ai-daily.md`);

    if (ds === dateInfo.dateStr) {
      allNews.push({ date: ds, ...todayNews });
      continue;
    }

    if (fs.existsSync(mdPath)) {
      try {
        const mdContent = fs.readFileSync(mdPath, 'utf-8');
        allNews.push({ date: ds, markdown: mdContent });
      } catch (e) {
        // 忽略读取失败
      }
    }
  }

  return allNews;
}

// 主函数
async function main() {
  const dateInfo = getDateInfo();
  console.log(`📅 日期: ${dateInfo.localeDateStr}`);

  try {
    // 1. 生成每日快讯
    console.log('📰 生成每日AI快讯...');
    const newsData = await generateDailyNews(dateInfo);

    // 保存到daily-news.json（首页显示）
    const dailyNewsPath = path.join(__dirname, '../data/daily-news.json');
    const output = {
      date: dateInfo.localeDateStr,
      updateTime: dateInfo.updateTime,
      ...newsData
    };
    fs.writeFileSync(dailyNewsPath, JSON.stringify(output, null, 2), 'utf-8');
    console.log('✅ daily-news.json 已更新');

    // 保存Markdown归档
    const dailyEntry = saveDailyMarkdown(dateInfo, newsData);
    updateArchiveIndex('daily', dailyEntry);
    console.log(`✅ ${dailyEntry.url} 已保存`);

    // 2. 如果是周末，生成周报
    if (dateInfo.isEndOfWeek) {
      console.log('📅 生成每周汇总...');
      // 收集本周所有每日快讯
      const weeklyNews = collectWeeklyNews(dateInfo, newsData);
      console.log(`  📦 收集到 ${weeklyNews.length} 天的快讯数据`);
      const weeklyMd = await generateSummary('weekly', dateInfo, weeklyNews);
      const weekNum = getWeekNumber(new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Shanghai' })));
      const weeklyPath = path.join(__dirname, `../archives/weekly/${dateInfo.year}-W${String(weekNum).padStart(2, '0')}-weekly.md`);
      fs.writeFileSync(weeklyPath, `# AI周报 ${dateInfo.year}年第${weekNum}周\n\n${weeklyMd}`, 'utf-8');
      updateArchiveIndex('weekly', {
        date: `${dateInfo.year}-W${String(weekNum).padStart(2, '0')}`,
        title: `AI周报 ${dateInfo.year}年第${weekNum}周`,
        url: `archives/weekly/${dateInfo.year}-W${String(weekNum).padStart(2, '0')}-weekly.md`
      });
      console.log('✅ 每周汇总已生成');
    }

    // 3. 如果是月末，生成月报
    if (dateInfo.isEndOfMonth) {
      console.log('📊 生成每月精选...');
      // 收集本月所有每日快讯
      const monthlyNews = collectMonthlyNews(dateInfo, newsData);
      console.log(`  📦 收集到 ${monthlyNews.length} 天的快讯数据`);
      const monthlyMd = await generateSummary('monthly', dateInfo, monthlyNews);
      const monthlyPath = path.join(__dirname, `../archives/monthly/${dateInfo.monthStr}-monthly.md`);
      fs.writeFileSync(monthlyPath, `# AI月报 ${dateInfo.year}年${parseInt(dateInfo.month)}月\n\n${monthlyMd}`, 'utf-8');
      updateArchiveIndex('monthly', {
        date: dateInfo.monthStr,
        title: `AI月报 ${dateInfo.year}年${parseInt(dateInfo.month)}月`,
        url: `archives/monthly/${dateInfo.monthStr}-monthly.md`
      });
      console.log('✅ 每月精选已生成');
    }

    // 4. 如果是季末，生成季报
    if (dateInfo.isEndOfQuarter) {
      console.log('📈 生成季度报告...');
      const quarterlyMd = await generateSummary('quarterly', dateInfo, newsData);
      const quarterlyPath = path.join(__dirname, `../archives/quarterly/${dateInfo.quarterStr}-quarterly.md`);
      fs.writeFileSync(quarterlyPath, `# AI季度报告 ${dateInfo.quarterStr}\n\n${quarterlyMd}`, 'utf-8');
      updateArchiveIndex('quarterly', {
        date: dateInfo.quarterStr,
        title: `AI季度报告 ${dateInfo.quarterStr}`,
        url: `archives/quarterly/${dateInfo.quarterStr}-quarterly.md`
      });
      console.log('✅ 季度报告已生成');
    }

    console.log('🎉 所有任务完成!');

  } catch (error) {
    console.error('❌ 生成失败:', error.message);
    process.exit(1);
  }
}

function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

main();
