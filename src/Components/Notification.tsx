import '../styles/Notification.css'

export default function Notification({success, message}: {success: boolean, message: string}){

    return (

        <div className={`notification ${success ? 'success' : 'failure'}`}>
            <p>{message}</p>
        </div>

    )

}