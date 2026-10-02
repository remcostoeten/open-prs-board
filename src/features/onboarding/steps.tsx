const STEPS = ['Inloggen', 'Workspace', 'Repositories', 'Bord']

export function Steps({ current }: { current: number }) {
    return (
        <ol className="steps">
            {STEPS.map((step, index) => (
                <li
                    key={step}
                    aria-current={index === current ? 'step' : undefined}
                    className={index < current ? 'done' : ''}
                >
                    {step}
                </li>
            ))}
        </ol>
    )
}
