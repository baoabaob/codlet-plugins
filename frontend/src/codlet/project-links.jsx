export const repositoryUrl='https://github.com/baoabaob/codlet';

export function createProjectLinks({React,C,I,t}){
  const h=React.createElement;
  return function ProjectLinks(){
    return <div className="codlet-project-links">
      <C.ButtonLink href={repositoryUrl} color="secondary" variant="ghost" size="sm" external target="_blank" rel="noopener noreferrer" aria-label={t('Open Codlet on GitHub')}>GitHub<I.ArrowUpRight/></C.ButtonLink>
      <C.ButtonLink href={repositoryUrl} className="codlet-star-link" color="secondary" variant="outline" size="sm" pill={false} external target="_blank" rel="noopener noreferrer" aria-label={t('Star Codlet on GitHub')}><I.Star/>Star</C.ButtonLink>
    </div>;
  };
}
