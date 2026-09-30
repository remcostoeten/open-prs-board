export function Explanation() {
    return (
        <section>
            <h2>Toelichting</h2>
            <div className="notes">
                <ul>
                    <li>
                        De gestreepte pijlen in de APP-stack wijzen van een branch naar de branch die erop gebaseerd
                        is.
                    </li>
                    <li>
                        <b>Approved</b> rijen zijn groen gemarkeerd en hoeven niet meer bekeken te worden. De threads
                        blijven zichtbaar als je de rij opent.
                    </li>
                    <li>
                        <b>Aan Daan: re-review</b> betekent dat ik elke opmerking heb beantwoord of verwerkt en dat de
                        PR bij hem ligt voor een nieuwe ronde.
                    </li>
                    <li>
                        Een oranje <b>Remco heeft gereageerd</b>-label op een thread, en het oranje{' '}
                        <b>↳ mijn antwoord</b>-bericht eronder, laten zien dat ik op die opmerking heb geantwoord. In de
                        bestandenlijst staat dan <b>✓ beantwoord</b> bij het bestand.
                    </li>
                    <li>
                        <b>Review</b> per thread: open betekent geen reactie of wijziging sinds de comment, opnieuw
                        bekijken betekent dat je hebt gereageerd of het bestand daarna hebt aangepast.
                    </li>
                    <li>
                        <b>Diff</b> telt toegevoegde en verwijderde regels tegen de target branch. <b>Pipeline</b> is
                        het buildresultaat op de head commit.
                    </li>
                    <li>
                        De oranje gebogen pijl van <b>#757</b> naar <b>#722</b>: de linting-PoC bouwt voort op de
                        prettier pre-commit hook.
                    </li>
                    <li>
                        <b>Prio</b> is de volgorde waarin Daan de losse PR&apos;s het beste kan oppakken (1 eerst). De
                        groepen buiten de APP-stack sorteren daarop; de knop bij de groepskop wisselt naar de volgorde
                        op bijgewerkt. De stack houdt altijd zijn merge-volgorde.
                    </li>
                    <li>
                        <b>Reviewtijd</b> is mijn inschatting van hoe lang Daan nodig heeft, zodat hij de snelle
                        PR&apos;s er tussendoor kan oppakken.
                    </li>
                    <li>
                        Bij een thread waarvan het bestand daarna is aangepast staat de code zoals die was op de PR-head
                        waarop Daan reageerde (uit de PR-historie in Bitbucket), met zijn geselecteerde regels
                        gemarkeerd, plus de diff van dat moment tot de huidige head.
                    </li>
                    <li>
                        <b>Assignee</b> is de reviewer in Bitbucket, omdat Bitbucket PR&apos;s geen assignee-veld
                        hebben. Alleen Daan en Pieter komen voor.
                    </li>
                    <li>
                        Een <b>grijs bolletje</b> bij Pipeline op #856 en #858: beide heads zijn vanochtend om 10:35
                        gepusht en hebben nog geen pipeline. De vorige run op beide branches was groen.
                    </li>
                    <li>
                        De <b>APP-stack</b> (#847 t/m #858) heeft geen env per branch. De hele stack draait op de
                        gedeelde env van <code>DEV-3326-APP</code>, gelinkt in de stack zelf.
                    </li>
                    <li>
                        Tickets <code>DEV-3754</code>, <code>DEV-3685</code> en <code>DEV-3204</code> hebben geen
                        WEB-key, dus daar staat de oude key.
                    </li>
                </ul>
            </div>
        </section>
    )
}
