import React from 'react';
import { useProjectStore } from '../stores/projectStore';
import WorldSimpleView from '../components/world/WorldSimpleView';
import WorldTabView from '../components/world/WorldTabView';
import WritingQualityContextBanner from '../components/quality/WritingQualityContextBanner';

const WorldPage: React.FC = () => {
  const { currentProject } = useProjectStore();

  if (!currentProject) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: '#6c6c80', fontSize: '14px' }}>
        请先选择或创建一个项目
      </div>
    );
  }

  return (
    <>
      <div style={{ padding: '16px 20px 0' }}>
        <WritingQualityContextBanner />
      </div>
      {currentProject.type === 'short_story' ? <WorldSimpleView /> : <WorldTabView />}
    </>
  );
};

export default WorldPage;
