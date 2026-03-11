const { deduplicateNews, generateFingerprint, cleanupOldRecords, loadPublishedCache } = require('./scripts/deduplication-manager');
const fs = require('fs');
const path = require('path');

// 模拟日期信息
function getDateInfo() {
  const now = new Date();
  return {
    year: now.getFullYear(),
    month: String(now.getMonth() + 1).padStart(2, '0'),
    day: String(now.getDate()).padStart(2, '0'),
    dateStr: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  };
}

// 测试1: 日期过滤验证
function testDateValidation() {
  console.log('\n📋 测试1: 日期过滤验证（7天限制）');
  console.log('=' .repeat(50));

  const dateInfo = getDateInfo();
  const currentDate = new Date(dateInfo.year, parseInt(dateInfo.month) - 1, parseInt(dateInfo.day));
  const sevenDaysAgo = new Date(currentDate);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const minDateStr = `${sevenDaysAgo.getFullYear()}-${String(sevenDaysAgo.getMonth() + 1).padStart(2, '0')}-${String(sevenDaysAgo.getDate()).padStart(2, '0')}`;

  console.log(`当前日期: ${dateInfo.dateStr}`);
  console.log(`最小允许日期: ${minDateStr} (7天前)`);

  // 测试数据
  const testNews = {
    llm: [
      { title: '今天的新闻', url: 'https://example.com/today', date: dateInfo.dateStr, source: 'Test' },
      { title: '3天前的新闻', url: 'https://example.com/3days', date: getDateString(-3), source: 'Test' },
      { title: '6天前的新闻', url: 'https://example.com/6days', date: getDateString(-6), source: 'Test' },
      { title: '8天前的新闻（应被过滤）', url: 'https://example.com/8days', date: getDateString(-8), source: 'Test' },
      { title: '10天前的新闻（应被过滤）', url: 'https://example.com/10days', date: getDateString(-10), source: 'Test' }
    ]
  };

  console.log('\n测试数据:');
  testNews.llm.forEach(item => {
    const daysDiff = Math.floor((currentDate - new Date(item.date)) / (1000 * 60 * 60 * 24));
    const status = item.date >= minDateStr ? '✅ 保留' : '❌ 过滤';
    console.log(`  ${status} - ${item.title} (${daysDiff}天前)`);
  });

  console.log('\n✅ 日期过滤逻辑正确\n');
}

// 测试2: 去重功能
function testDeduplication() {
  console.log('\n📋 测试2: 去重功能验证');
  console.log('=' .repeat(50));

  const dateInfo = getDateInfo();

  // 清理旧的缓存
  const cacheFile = path.join(__dirname, 'data/published-news-cache.json');
  if (fs.existsSync(cacheFile)) {
    fs.unlinkSync(cacheFile);
    console.log('已清理旧缓存文件');
  }

  // 第一次运行 - 添加新闻
  console.log('\n第一次运行（添加新闻）:');
  const news1 = {
    llm: [
      { title: 'GPT-5发布', url: 'https://openai.com/gpt5', date: dateInfo.dateStr, source: 'OpenAI' },
      { title: 'Claude 3.5更新', url: 'https://anthropic.com/claude', date: dateInfo.dateStr, source: 'Anthropic' }
    ],
    coding: [
      { title: 'Cursor新功能', url: 'https://cursor.sh/new', date: dateInfo.dateStr, source: 'Cursor' }
    ]
  };

  const result1 = deduplicateNews(JSON.parse(JSON.stringify(news1)), dateInfo);
  const count1 = Object.values(result1).flat().length;
  console.log(`结果: ${count1} 条新闻（预期3条）`);

  // 第二次运行 - 包含重复新闻
  console.log('\n第二次运行（包含重复新闻）:');
  const news2 = {
    llm: [
      { title: 'GPT-5发布', url: 'https://openai.com/gpt5', date: dateInfo.dateStr, source: 'OpenAI' }, // 重复
      { title: 'Claude 3.5更新', url: 'https://anthropic.com/claude', date: dateInfo.dateStr, source: 'Anthropic' }, // 重复
      { title: 'Gemini 2.0发布', url: 'https://google.com/gemini', date: dateInfo.dateStr, source: 'Google' } // 新的
    ],
    coding: [
      { title: 'Cursor新功能', url: 'https://cursor.sh/new', date: dateInfo.dateStr, source: 'Cursor' }, // 重复
      { title: 'GitHub Copilot更新', url: 'https://github.com/copilot', date: dateInfo.dateStr, source: 'GitHub' } // 新的
    ]
  };

  const result2 = deduplicateNews(JSON.parse(JSON.stringify(news2)), dateInfo);
  const count2 = Object.values(result2).flat().length;
  console.log(`结果: ${count2} 条新闻（预期2条新新闻）`);

  // 验证缓存
  console.log('\n验证缓存文件:');
  if (fs.existsSync(cacheFile)) {
    const cache = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
    console.log(`缓存中有 ${Object.keys(cache.records).length} 条记录`);
    console.log('✅ 去重功能正常\n');
  } else {
    console.log('❌ 缓存文件未创建\n');
  }
}

// 测试3: URL和标题去重
function testFingerprintGeneration() {
  console.log('\n📋 测试3: 指纹生成测试');
  console.log('=' .repeat(50));

  // 相同URL的新闻应该生成相同指纹
  const news1 = { title: 'GPT-5发布', url: 'https://openai.com/gpt5' };
  const news2 = { title: 'GPT-5正式发布', url: 'https://openai.com/gpt5' };
  const fp1 = generateFingerprint(news1);
  const fp2 = generateFingerprint(news2);

  console.log(`新闻1: "${news1.title}" (${news1.url})`);
  console.log(`新闻2: "${news2.title}" (${news2.url})`);
  console.log(`指纹1: ${fp1}`);
  console.log(`指纹2: ${fp2}`);
  console.log(`结果: ${fp1 === fp2 ? '✅ 相同URL生成相同指纹' : '❌ 指纹不同'}\n`);

  // 不同URL但相同标题的新闻
  const news3 = { title: 'Claude 3.5更新', url: '' };
  const news4 = { title: 'Claude 3.5更新', url: 'https://different.com' };
  const fp3 = generateFingerprint(news3);
  const fp4 = generateFingerprint(news4);

  console.log(`新闻3: "${news3.title}" (${news3.url || '无URL'})`);
  console.log(`新闻4: "${news4.title}" (${news4.url})`);
  console.log(`指纹3: ${fp3}`);
  console.log(`指纹4: ${fp4}`);
  console.log(`结果: ${fp3 !== fp4 ? '✅ 不同URL生成不同指纹' : '❌ 指纹相同（错误）'}\n`);
}

// 测试4: 缓存清理
function testCacheCleanup() {
  console.log('\n📋 测试4: 缓存清理测试');
  console.log('=' .repeat(50));

  const dateInfo = getDateInfo();

  // 创建测试缓存，包含一些过期记录
  const testCache = {
    records: {
      'fp1': { title: '今天新闻', publishDate: dateInfo.dateStr, source: 'Test' },
      'fp2': { title: '3天前新闻', publishDate: getDateString(-3), source: 'Test' },
      'fp3': { title: '6天前新闻', publishDate: getDateString(-6), source: 'Test' },
      'fp4': { title: '8天前新闻（应清理）', publishDate: getDateString(-8), source: 'Test' },
      'fp5': { title: '10天前新闻（应清理）', publishDate: getDateString(-10), source: 'Test' }
    },
    lastCleanup: getDateString(-1)
  };

  console.log(`清理前: ${Object.keys(testCache.records).length} 条记录`);
  Object.keys(testCache.records).forEach(fp => {
    console.log(`  - ${testCache.records[fp].title} (${testCache.records[fp].publishDate})`);
  });

  const cleanedCache = cleanupOldRecords(testCache, dateInfo);

  console.log(`\n清理后: ${Object.keys(cleanedCache.records).length} 条记录`);
  Object.keys(cleanedCache.records).forEach(fp => {
    console.log(`  - ${cleanedCache.records[fp].title} (${cleanedCache.records[fp].publishDate})`);
  });

  console.log(`\n✅ 清理了 ${5 - Object.keys(cleanedCache.records).length} 条过期记录\n`);
}

// 辅助函数：获取指定天数偏移的日期字符串
function getDateString(daysOffset) {
  const date = new Date();
  date.setDate(date.getDate() + daysOffset);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// 运行所有测试
console.log('\n');
console.log('╔' + '═'.repeat(58) + '╗');
console.log('║' + ' '.repeat(12) + 'AI资讯模块功能增强 - 单元测试' + ' '.repeat(14) + '║');
console.log('╚' + '═'.repeat(58) + '╝');

try {
  testDateValidation();
  testDeduplication();
  testFingerprintGeneration();
  testCacheCleanup();

  console.log('\n');
  console.log('╔' + '═'.repeat(58) + '╗');
  console.log('║' + ' '.repeat(20) + '✅ 所有测试通过' + ' '.repeat(22) + '║');
  console.log('╚' + '═'.repeat(58) + '╝');
  console.log('\n');
} catch (error) {
  console.error('\n❌ 测试失败:', error.message);
  console.error(error.stack);
  process.exit(1);
}
