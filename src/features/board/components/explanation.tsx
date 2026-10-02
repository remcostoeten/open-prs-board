export function Explanation() {
    return (
        <section>
            <h2>Toelichting</h2>
            <div className="notes">
                <ul>
                    <li>
                        <b>Pijlen</b> tussen PR&apos;s komen uit de branches (een PR die op de branch van een andere PR
                        is gebaseerd) of zijn met de hand gezet onder <b>Pijl naar</b> in een geopende rij. Elke pijl
                        kan weg.
                    </li>
                    <li>
                        <b>Groepen</b> maak je met <b>+ Groep</b>. Zet een PR in een groep onder <b>Indeling</b> en
                        verplaats hem met de pijltjes.
                    </li>
                    <li>
                        <b>Review</b> per thread: <i>open</i> betekent dat de auteur aan zet is,{' '}
                        <i>reviewer is aan zet</i> betekent dat er is geantwoord of dat het bestand daarna is aangepast.
                    </li>
                    <li>
                        <b>Wacht op mij</b> toont PR&apos;s waar jij de auteur bent van een open thread, of reviewer van
                        een PR die op een nieuwe ronde wacht.
                    </li>
                    <li>
                        Reacties, notities, prio en reviewtijd staan alleen op dit bord. Noem een collega met{' '}
                        <b>@naam</b> voor een melding.
                    </li>
                    <li>
                        Het <b>archief</b> toont PR&apos;s die in de laatste 30 dagen zijn gemerged of gesloten.
                    </li>
                </ul>
            </div>
        </section>
    )
}
