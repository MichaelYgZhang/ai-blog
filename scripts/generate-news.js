const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

async function generateDailyNews() {
  const today = new Date();
  const dateStr = today.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  const updateTime = today.toISOString().slice(0, 16).replace('T', ' ');

  const prompt = `你是一个AI行业资讯专家。请生成今天(${dateStr})的AI领域最新资讯汇总。

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

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "你是一个AI行业资讯专家，只返回JSON格式数据。" },
        { role: "user", content: prompt }
      ],
      temperature: 0.7,
      max_tokens: 2000
    });

    let content = completion.choices[0].message.content;

    // 清理可能的markdown代码块
    content = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    const newsData = JSON.parse(content);

    const output = {
      date: dateStr,
      updateTime: updateTime,
      ...newsData
    };

    const outputPath = path.join(__dirname, '../data/daily-news.json');
    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf-8');

    console.log('✅ 每日AI快讯已更新:', dateStr);
    console.log(JSON.stringify(output, null, 2));

  } catch (error) {
    console.error('❌ 生成新闻失败:', error.message);

    // 如果API调用失败，更新时间戳但保留旧数据
    const existingPath = path.join(__dirname, '../data/daily-news.json');
    if (fs.existsSync(existingPath)) {
      const existing = JSON.parse(fs.readFileSync(existingPath, 'utf-8'));
      existing.updateTime = updateTime + ' (更新失败,显示缓存)';
      fs.writeFileSync(existingPath, JSON.stringify(existing, null, 2), 'utf-8');
    }

    process.exit(1);
  }
}

generateDailyNews();
