export const repositoryUrl='https://github.com/baoabaob/codlet';

export function createProjectLinks({React,C,I,t}){
  const h=React.createElement;
  return function ProjectLinks(){
    return <div className="codlet-project-links">
      <C.Tooltip content={t('Leave a star~ ⭐️')}><C.TextLink href={repositoryUrl} className="codlet-project-link" target="_blank" rel="noopener noreferrer" aria-label={t('Open Codlet on GitHub')}>GitHub<I.ArrowUpRight/></C.TextLink></C.Tooltip>
    </div>;
  };
}
