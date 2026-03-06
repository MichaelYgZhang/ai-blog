const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');

// 支持 DeepSeek API (兼容OpenAI接口)
const openai = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: 'https://api.deepseek.com'
});

// 获取日期信息
function getDateInfo() {
  const now = new Date();
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
    updateTime: now.toISOString().slice(0, 16).replace('T', ' ')
  };
}

// 生成每日快讯
async function generateDailyNews(dateInfo) {
  const prompt = `你是一个AI行业资讯专家。请生成今天(${dateInfo.localeDateStr})的AI领域最新资讯汇总。

请严格按照以下JSON格式返回，每个分类3-5条新闻：

{
  "llm": [
    { "title": "新闻标题", "url": "相关链接(可选)", "hot": true/false }
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
1. 内容要真实可信，基于近期AI领域的真实动态
2. 每个分类标记1-2条热门新闻(hot: true)
3. URL只填写官方链接，不确定的可以不填
4. 标题简洁有力，不超过30字
5. 只返回JSON，不要其他内容`;

  const completion = await openai.chat.completions.create({
    model: "deepseek-chat",  // DeepSeek V3
    messages: [
      { role: "system", content: "你是一个AI行业资讯专家，只返回JSON格式数据。" },
      { role: "user", content: prompt }
    ],
    temperature: 0.7,
    max_tokens: 2000
  });

  let content = completion.choices[0].message.content;
  content = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

  return JSON.parse(content);
}

// 生成周报/月报/季报
async function generateSummary(type, dateInfo, recentNews) {
  const typeNames = { weekly: '周', monthly: '月', quarterly: '季度' };
  const typeName = typeNames[type];

  const prompt = `基于以下近期AI快讯内容，生成一份${typeName}度高价值内容汇总：

${JSON.stringify(recentNews, null, 2)}

请生成Markdown格式的${typeName}报，包含：
1. 本${typeName}最重要的5-10条AI动态（按影响力排序）
2. 分类汇总（大模型/AI工具/行业动态/研究进展）
3. 趋势洞察（2-3个关键趋势）
4. 值得关注的项目或工具

格式要求：
- 使用中文
- 标题使用##
- 列表使用-
- 重要内容加粗`;

  const completion = await openai.chat.completions.create({
    model: "deepseek-chat",  // DeepSeek V3
    messages: [
      { role: "system", content: "你是一个AI行业分析师，生成高质量的行业报告。" },
      { role: "user", content: prompt }
    ],
    temperature: 0.7,
    max_tokens: 3000
  });

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
        if (item.url) {
          md += `- [${item.title}](${item.url})${hot}\n`;
        } else {
          md += `- ${item.title}${hot}\n`;
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
      // 读取本周的快讯
      const weeklyMd = await generateSummary('weekly', dateInfo, newsData);
      const weekNum = getWeekNumber(new Date());
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
      const monthlyMd = await generateSummary('monthly', dateInfo, newsData);
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
