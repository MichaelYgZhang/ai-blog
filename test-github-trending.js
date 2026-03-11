const { fetchGitHubTrending, filterAIProjects, isAIProject } = require('./scripts/github-trending');

async function testGitHubTrending() {
  console.log('\n');
  console.log('╔' + '═'.repeat(58) + '╗');
  console.log('║' + ' '.repeat(14) + 'GitHub Trending 功能测试' + ' '.repeat(18) + '║');
  console.log('╚' + '═'.repeat(58) + '╝');
  console.log('\n');

  try {
    console.log('📋 测试: 获取GitHub Trending（weekly）');
    console.log('=' .repeat(50));

    const projects = await fetchGitHubTrending('weekly');

    if (projects.length === 0) {
      console.log('⚠️ 未获取到GitHub Trending数据（可能是网络问题）');
      return;
    }

    console.log(`✅ 获取到 ${projects.length} 个项目\n`);

    // 显示前5个项目
    console.log('前5个项目:');
    projects.slice(0, 5).forEach((project, index) => {
      console.log(`${index + 1}. ${project.name}`);
      console.log(`   语言: ${project.language || '未知'}`);
      console.log(`   Stars: ${project.totalStars.toLocaleString()} (+${project.starsThisPeriod.toLocaleString()} this week)`);
      console.log(`   描述: ${project.description.substring(0, 80)}...`);
      console.log('');
    });

    // 测试AI项目筛选
    console.log('📋 测试: AI项目筛选');
    console.log('=' .repeat(50));

    const aiProjects = filterAIProjects(projects);
    console.log(`✅ 筛选出 ${aiProjects.length} 个AI相关项目\n`);

    if (aiProjects.length > 0) {
      console.log('AI项目示例:');
      aiProjects.slice(0, 5).forEach((project, index) => {
        const isAI = isAIProject(project);
        console.log(`${index + 1}. ${project.name} - ${isAI ? '✅ AI项目' : '❌ 非AI项目'}`);
        if (project.description) {
          console.log(`   描述: ${project.description.substring(0, 60)}...`);
        }
        console.log('');
      });
    }

    console.log('✅ GitHub Trending功能测试完成\n');

  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    console.log('\n💡 提示: GitHub Trending功能需要网络连接，失败不影响核心功能\n');
  }

  console.log('╔' + '═'.repeat(58) + '╗');
  console.log('║' + ' '.repeat(18) + '测试完成' + ' '.repeat(30) + '║');
  console.log('╚' + '═'.repeat(58) + '╝');
  console.log('\n');
}

testGitHubTrending();
